import { useAIHub } from "@/hooks/useAIHub";
import { useAuth } from "@/hooks/useAuth";
import { NSFWFilter, ageVerifier } from "@/lib/age-verification";
import type { ImageAsset } from "@/types/ai-package";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const QWEN_MODEL_ID = "qwen-image-edit-plus-nsfw-lora";
const STORAGE_KEY_PKG = "privseai_default_package";

export function ImageEditPage() {
	const navigate = useNavigate();
	const { aiHub, tick } = useAIHub();
	const { user } = useAuth();
	const [ageVerified, setAgeVerified] = useState(false);
	const [prompt, setPrompt] = useState("");
	const [negativePrompt, setNegativePrompt] = useState("");
	const [width, setWidth] = useState(1024);
	const [height, setHeight] = useState(1024);
	const [steps, setSteps] = useState(30);
	const [cfg, setCfg] = useState(7);
	const [isGenerating, setIsGenerating] = useState(false);
	const [generatedImages, setGeneratedImages] = useState<ImageAsset[]>([]);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const checkAge = async () => {
			const result = await ageVerifier.checkAge();
			if (!result.verified) {
				navigate("/settings", { replace: true });
			} else {
				setAgeVerified(true);
			}
		};
		checkAge();
	}, [navigate]);

	useEffect(() => {
		const pkgId = localStorage.getItem(STORAGE_KEY_PKG) ?? "";
		if (pkgId) {
			const images = aiHub.getPackageImages(pkgId);
			setGeneratedImages(images);
		}
	}, [tick, aiHub]);

	const handleGenerate = useCallback(async () => {
		if (!prompt.trim() || !ageVerified) return;

		setIsGenerating(true);
		setError(null);

		try {
			const nsfwFilter = new NSFWFilter({ bypass: true });
			const nsfwCheck = nsfwFilter.checkContent(prompt);
			if (nsfwCheck.isExplicit) {
				setError("Content flagged. Age verification required — please verify in Settings.");
				return;
			}

			const pkgId = localStorage.getItem(STORAGE_KEY_PKG) ?? "";
			const workflow = aiHub.createQwenNSFWEditWorkflow(pkgId, "Qwen NSFW Edit", {
				prompt,
				negativePrompt,
				width,
				height,
				steps,
				cfg,
			});

			if (!workflow) {
				setError("ComfyUI client not available. Start a ComfyUI server first.");
				return;
			}

			const result = await aiHub.generateImage(pkgId, workflow);

			if ("error" in result) {
				setError(result.error);
				return;
			}

			if ("jobId" in result) {
				const image = await aiHub.waitForImage(result.jobId, pkgId, 90000);
				if (image) {
					setGeneratedImages((prev) => [image, ...prev]);
				} else {
					setError("Generation timed out or failed");
				}
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Generation failed");
		} finally {
			setIsGenerating(false);
		}
	}, [prompt, negativePrompt, width, height, steps, cfg, ageVerified, aiHub]);

	if (!ageVerified) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="text-center">
					<h2 className="text-xl font-bold mb-4">Age Verification Required</h2>
					<p className="text-gray-400 mb-4">This page contains adult content.</p>
					<button
						onClick={() => navigate("/settings")}
						className="px-4 py-2 rounded-xl bg-pink-500 text-white font-semibold"
					>
						Go to Settings to verify age
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 h-full overflow-y-auto">
			<div className="max-w-4xl mx-auto p-6">
				<div className="flex items-center gap-3 mb-6">
					<span className="text-2xl">🎨</span>
					<h1 className="text-2xl font-bold text-white">Qwen NSFW Image Editor</h1>
					<span className="text-xs px-2 py-1 bg-pink-500/20 text-pink-300 rounded-full">
						Model: {QWEN_MODEL_ID}
					</span>
				</div>

				{user && (
					<p className="mb-4 text-sm text-gray-400">Logged in as: {user.email ?? user.name}</p>
				)}

				<div className="space-y-4">
					<div>
						<label className="block text-sm font-medium mb-1">Prompt</label>
						<textarea
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							placeholder="Enter your image generation prompt..."
							className="w-full px-3 py-2 rounded-xl bg-[#13141f] border border-white/10 text-white placeholder-gray-500 focus:border-pink-500/50 outline-none"
							rows={3}
						/>
					</div>

					<div>
						<label className="block text-sm font-medium mb-1">Negative Prompt</label>
						<input
							type="text"
							value={negativePrompt}
							onChange={(e) => setNegativePrompt(e.target.value)}
							placeholder="worst quality, low quality, blurry..."
							className="w-full px-3 py-2 rounded-xl bg-[#13141f] border border-white/10 text-white placeholder-gray-500 focus:border-pink-500/50 outline-none"
						/>
					</div>

					<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
						<div>
							<label className="text-xs text-gray-400">Width</label>
							<input
								type="number"
								value={width}
								onChange={(e) => setWidth(Number(e.target.value))}
								className="w-full px-2 py-1 rounded bg-[#13141f] border border-white/10 text-white"
								min={256}
								max={2048}
								step={64}
							/>
						</div>
						<div>
							<label className="text-xs text-gray-400">Height</label>
							<input
								type="number"
								value={height}
								onChange={(e) => setHeight(Number(e.target.value))}
								className="w-full px-2 py-1 rounded bg-[#13141f] border border-white/10 text-white"
								min={256}
								max={2048}
								step={64}
							/>
						</div>
						<div>
							<label className="text-xs text-gray-400">Steps</label>
							<input
								type="number"
								value={steps}
								onChange={(e) => setSteps(Number(e.target.value))}
								className="w-full px-2 py-1 rounded bg-[#13141f] border border-white/10 text-white"
								min={1}
								max={100}
							/>
						</div>
						<div>
							<label className="text-xs text-gray-400">CFG Scale</label>
							<input
								type="number"
								value={cfg}
								onChange={(e) => setCfg(Number(e.target.value))}
								className="w-full px-2 py-1 rounded bg-[#13141f] border border-white/10 text-white"
								min={1}
								max={20}
								step={0.5}
							/>
						</div>
					</div>

					<button
						onClick={handleGenerate}
						disabled={isGenerating || !prompt.trim()}
						className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-sm disabled:opacity-50 transition"
					>
						{isGenerating ? "Generating..." : "Generate with Qwen NSFW LoRA"}
					</button>

					{error && (
						<div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">
							{error}
						</div>
					)}

					{generatedImages.length > 0 && (
						<div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
							{generatedImages.map((img) => (
								<img
									key={img.id}
									src={img.url}
									alt={img.title}
									className="rounded-xl object-cover w-full h-48"
								/>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
