import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ProviderModelConfig } from "@mariozechner/pi-coding-agent";

const PROVIDER = "lm-studio";
const DEFAULT_ROOT_URL = "http://127.0.0.1:1234";
const DEFAULT_API_KEY = "lm-studio";
const STATUS_ID = "lm-studio";
const PURPLE = "\x1b[38;5;129m";
const RESET = "\x1b[0m";
const ACTIVE_LABEL = `${PURPLE}LM Studio Active${RESET}`;

type OpenAIModelListResponse = {
	data?: Array<{
		id?: string;
		object?: string;
	}>;
};

type LMStudioNativeModel = {
	type?: string;
	key?: string;
	display_name?: string;
	max_context_length?: number;
	capabilities?: {
		vision?: boolean;
		trained_for_tool_use?: boolean;
	};
	loaded_instances?: Array<{
		id?: string;
		config?: {
			context_length?: number;
		};
	}>;
};

type LMStudioNativeModelsResponse = {
	models?: LMStudioNativeModel[];
};

let cachedRootUrl = DEFAULT_ROOT_URL;
let cachedModels: ProviderModelConfig[] = [];

function envFlag(name: string, defaultValue: boolean): boolean {
	const value = process.env[name]?.trim().toLowerCase();
	if (!value) return defaultValue;
	if (["1", "true", "yes", "on"].includes(value)) return true;
	if (["0", "false", "no", "off"].includes(value)) return false;
	return defaultValue;
}

function normalizeRootUrl(url: string): string {
	const trimmed = url.trim().replace(/\/+$/, "");
	if (!trimmed) return DEFAULT_ROOT_URL;
	if (trimmed.endsWith("/api/v1")) return trimmed.slice(0, -"/api/v1".length);
	if (trimmed.endsWith("/v1")) return trimmed.slice(0, -"/v1".length);
	return trimmed;
}

function getRootUrl(): string {
	return normalizeRootUrl(process.env.LM_STUDIO_BASE_URL ?? process.env.LM_STUDIO_URL ?? DEFAULT_ROOT_URL);
}

function getOpenAIBaseUrl(rootUrl: string): string {
	return `${normalizeRootUrl(rootUrl)}/v1`;
}

function createCompat() {
	return {
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
		supportsUsageInStreaming: envFlag("LM_STUDIO_STREAM_USAGE", true),
		maxTokensField: "max_tokens" as const,
	};
}

async function fetchJson<T>(url: string, timeoutMs = 3000): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			headers: { Accept: "application/json" },
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error(`${response.status} ${response.statusText}`.trim());
		}

		return (await response.json()) as T;
	} finally {
		clearTimeout(timeout);
	}
}

function buildModels(
	openAIModels: OpenAIModelListResponse | null,
	nativeModels: LMStudioNativeModelsResponse | null,
): ProviderModelConfig[] {
	const nativeById = new Map<string, LMStudioNativeModel>();
	for (const model of nativeModels?.models ?? []) {
		if (model.key) nativeById.set(model.key, model);
		for (const instance of model.loaded_instances ?? []) {
			if (instance.id) nativeById.set(instance.id, model);
		}
	}

	const discoveredIds = new Set<string>();
	for (const model of openAIModels?.data ?? []) {
		if (typeof model.id === "string" && model.id.trim()) discoveredIds.add(model.id.trim());
	}
	for (const model of nativeModels?.models ?? []) {
		if (typeof model.key === "string" && model.key.trim()) discoveredIds.add(model.key.trim());
		for (const instance of model.loaded_instances ?? []) {
			if (typeof instance.id === "string" && instance.id.trim()) discoveredIds.add(instance.id.trim());
		}
	}

	return [...discoveredIds]
		.sort((a, b) => a.localeCompare(b))
		.filter((id) => {
			const native = nativeById.get(id);
			const lowerId = id.toLowerCase();
			if (native?.type && native.type !== "llm") return false;
			if (lowerId.includes("embedding") || lowerId.includes("embed-")) return false;
			return true;
		})
		.map((id) => {
			const native = nativeById.get(id);
			const contextWindow = Math.max(
				4096,
				native?.loaded_instances?.[0]?.config?.context_length ?? native?.max_context_length ?? 128000,
			);
			const maxTokens = Math.max(4096, Math.min(32768, Math.floor(contextWindow / 4)));
			const supportsVision = !!native?.capabilities?.vision;
			const trainedForToolUse = !!native?.capabilities?.trained_for_tool_use;
			const modelName = native?.display_name ?? id;
			const lowerId = id.toLowerCase();
			const lowerName = modelName.toLowerCase();
			const reasoning =
				lowerId.includes("reason") ||
				lowerId.includes("r1") ||
				lowerId.includes("thinking") ||
				lowerName.includes("reason") ||
				lowerName.includes("thinking");

			return {
				id,
				name: trainedForToolUse ? `${modelName} (LM Studio)` : `${modelName} (LM Studio, no tool tuning)`,
				reasoning,
				input: supportsVision ? (["text", "image"] as const) : (["text"] as const),
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow,
				maxTokens,
				compat: createCompat(),
			};
		});
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number): string {
	return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function setStatus(ctx: ExtensionContext, text: string) {
	ctx.ui.setStatus(STATUS_ID, text);
}

function updateStatus(ctx: ExtensionContext) {
	if (ctx.model?.provider !== PROVIDER) {
		setStatus(ctx, `LM Studio: ${cachedModels.length} model${cachedModels.length === 1 ? "" : "s"} @ ${cachedRootUrl}`);
		return;
	}

	const usage = ctx.getContextUsage();
	const usageText =
		usage?.tokens != null
			? ` · ctx ${formatNumber(usage.tokens)}/${formatNumber(usage.contextWindow)} (${formatPercent(usage.percent ?? 0)})`
			: ` · ctx unknown/${formatNumber(ctx.model.contextWindow)}`;
	setStatus(ctx, `${ACTIVE_LABEL}: ${ctx.model.id} @ ${cachedRootUrl}${usageText}`);
}

async function detectModels(): Promise<{ rootUrl: string; models: ProviderModelConfig[] }> {
	const rootUrl = getRootUrl();
	const [openAIResult, nativeResult] = await Promise.allSettled([
		fetchJson<OpenAIModelListResponse>(`${rootUrl}/v1/models`),
		fetchJson<LMStudioNativeModelsResponse>(`${rootUrl}/api/v1/models`),
	]);

	const openAIModels = openAIResult.status === "fulfilled" ? openAIResult.value : null;
	const nativeModels = nativeResult.status === "fulfilled" ? nativeResult.value : null;
	const models = buildModels(openAIModels, nativeModels);

	if (models.length === 0) {
		const reasons = [openAIResult, nativeResult]
			.filter((result): result is PromiseRejectedResult => result.status === "rejected")
			.map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)));
		throw new Error(
			reasons.length > 0 ? `No models detected at ${rootUrl}: ${reasons.join(" | ")}` : `No models detected at ${rootUrl}`,
		);
	}

	return { rootUrl, models };
}

export default async function lmStudioExtension(pi: ExtensionAPI) {
	async function registerDetectedProvider(ctx?: ExtensionContext, notify = false): Promise<ProviderModelConfig[]> {
		const { rootUrl, models } = await detectModels();
		cachedRootUrl = rootUrl;
		cachedModels = models;

		pi.registerProvider(PROVIDER, {
			baseUrl: getOpenAIBaseUrl(rootUrl),
			api: "openai-completions",
			apiKey: DEFAULT_API_KEY,
			models,
		});

		if (ctx) {
			updateStatus(ctx);
			if (notify) {
				ctx.ui.notify(`LM Studio: detected ${models.length} model${models.length === 1 ? "" : "s"}.`, "success");
			}
		}

		return models;
	}

	async function refreshWithFeedback(ctx: ExtensionContext, notify = false): Promise<ProviderModelConfig[]> {
		try {
			return await registerDetectedProvider(ctx, notify);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setStatus(ctx, `LM Studio unavailable @ ${getRootUrl()}`);
			if (notify) ctx.ui.notify(message, "error");
			throw error;
		}
	}

	try {
		await registerDetectedProvider();
	} catch {
		// Keep extension load resilient; the user can refresh later once LM Studio is up.
	}

	pi.on("session_start", async (_event, ctx) => {
		try {
			await refreshWithFeedback(ctx, false);
			updateStatus(ctx);
		} catch {
			// Keep startup quiet; the user can run /lm-studio-refresh once LM Studio is up.
		}
	});

	pi.registerCommand("lm-studio-refresh", {
		description: "Redetect LM Studio models and register them in /model",
		handler: async (_args, ctx) => {
			await refreshWithFeedback(ctx, true);
		},
	});

	pi.registerCommand("lm-studio-context", {
		description: "Show LM Studio context window usage for the active session",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			if (ctx.model?.provider !== PROVIDER) {
				ctx.ui.notify("Current model is not an LM Studio model.", "info");
				return;
			}

			const usage = ctx.getContextUsage();
			if (!usage || usage.tokens == null) {
				ctx.ui.notify(`Context usage unavailable for ${PROVIDER}/${ctx.model.id} right now.`, "info");
				updateStatus(ctx);
				return;
			}

			const remaining = Math.max(0, usage.contextWindow - usage.tokens);
			ctx.ui.notify(
				`${PROVIDER}/${ctx.model.id}: ${formatNumber(usage.tokens)}/${formatNumber(usage.contextWindow)} tokens used (${formatPercent(usage.percent ?? 0)}), ${formatNumber(remaining)} remaining.`,
				"info",
			);
			updateStatus(ctx);
		},
	});

	pi.registerCommand("lm-studio-use", {
		description: "Select a detected LM Studio model",
		getArgumentCompletions: (prefix) => {
			const value = prefix.trim().toLowerCase();
			const items = cachedModels
				.map((model) => ({ value: model.id, label: `${model.id} — ${model.name}` }))
				.filter((item) => !value || item.value.toLowerCase().includes(value) || item.label.toLowerCase().includes(value));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx: ExtensionCommandContext) => {
			if (cachedModels.length === 0) {
				await refreshWithFeedback(ctx, false);
			}

			let chosenId = args.trim();
			if (!chosenId) {
				const options = cachedModels.map((model) => `${model.id} — ${model.name}`);
				const selected = await ctx.ui.select("Choose an LM Studio model", options);
				if (!selected) return;
				chosenId = selected.split(" — ", 1)[0] ?? "";
			}

			const model = ctx.modelRegistry.find(PROVIDER, chosenId);
			if (!model) {
				await refreshWithFeedback(ctx, false);
			}

			const resolvedModel = ctx.modelRegistry.find(PROVIDER, chosenId);
			if (!resolvedModel) {
				ctx.ui.notify(`LM Studio model not found: ${chosenId}`, "error");
				return;
			}

			const ok = await pi.setModel(resolvedModel);
			if (!ok) {
				ctx.ui.notify(`Could not switch to ${PROVIDER}/${chosenId}.`, "error");
				return;
			}

			ctx.ui.notify(`Switched to ${PROVIDER}/${chosenId}`, "success");
		},
	});

	pi.on("model_select", async (_event, ctx) => {
		updateStatus(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		if (ctx.model?.provider === PROVIDER) {
			updateStatus(ctx);
		}
	});
}
