import { useRef, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Brain, BarChart3, Heart, ArrowRight, Loader2 } from "lucide-react";
import { FeatureCard } from "@/components/lab/FeatureCard";
import { Header } from "@/components/lab/Header";
import { Footer } from "@/components/lab/Footer";
import { analyzeLabReportWithGemini } from "@/lib/gemini";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/LanguageContext";
import { t } from "@/lib/translations";

const LandingPage = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const { toast } = useToast();
    const { lang } = useLang();

    // Check API key on mount
    useEffect(() => {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
            console.error("[LandingPage] CRITICAL: VITE_GEMINI_API_KEY is not defined!");
        } else {
            console.log("[LandingPage] Gemini API Key found:", apiKey.substring(0, 6) + "...");
        }
    }, []);

    const isAiReady = !!import.meta.env.VITE_GEMINI_API_KEY;

    const handleUpload = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
            if (!allowedTypes.includes(file.type)) {
                toast({
                    title: "Unsupported file type",
                    description: "Please upload a PDF or an image (JPG, PNG, WEBP) of your report.",
                    variant: "destructive"
                });
                return;
            }

            if (file.size > 20 * 1024 * 1024) {
                toast({ title: "File too large (max 20MB)", variant: "destructive" });
                return;
            }

            setIsUploading(true);
            try {
                const reader = new FileReader();
                const base64 = await new Promise<string>((resolve, reject) => {
                    reader.onload = () => {
                        const result = reader.result as string;
                        resolve(result.split(",")[1]);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                console.log("[LandingPage] Starting analysis for file:", file.name, "Type:", file.type, "Size:", file.size);
                const metrics = await analyzeLabReportWithGemini(base64, file.name, file.type);
                console.log("[LandingPage] Metrics received:", metrics);

                if (metrics && Object.keys(metrics).length > 0) {
                    toast({ title: "Report analyzed successfully!" });
                    navigate("/results", { state: { metrics } });
                } else {
                    toast({
                        title: "No data extracted",
                        description: "The AI couldn't find any medical metrics. Please try a clearer scan or use our demo report.",
                        variant: "destructive"
                    });
                }
            } catch (err: any) {
                console.error("[LandingPage] Analysis Error:", err);
                const errorMessage = err instanceof Error ? err.message : String(err);

                toast({
                    title: "Analysis failed",
                    description: `Error: ${errorMessage}. Try again or use the demo report.`,
                    variant: "destructive",
                });
            } finally {
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
            }
        },
        [navigate, toast]
    );

    const handleTryDemo = () => {
        navigate("/results");
    };

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-white to-slate-50">
            <Header />

            {/* Hero */}
            <section className="px-6 pt-16 pb-16 md:pt-24 md:pb-24 text-center max-w-4xl mx-auto">
                <div className="mb-8 flex justify-center">
                    <div className="relative">
                        <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-xl shadow-blue-500/25 animate-float">
                            <Brain className="h-12 w-12 md:h-16 md:w-16 text-white" />
                        </div>
                        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center shadow-lg animate-pulse">
                            <span className="text-white text-xs font-bold">AI</span>
                        </div>
                    </div>
                </div>

                <h1 className="text-3xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight mb-4 tracking-tight">
                    {t(lang, "heroHeadline1")}
                    <br />
                    <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                        {t(lang, "heroHeadline2")}
                    </span>
                </h1>

                <p className="text-base md:text-lg text-slate-500 max-w-2xl mx-auto mb-6 leading-relaxed">
                    {t(lang, "heroSubtitle")}
                </p>

                {!isAiReady && (
                    <div className="mb-8 p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm font-medium inline-flex items-center gap-2 animate-bounce">
                        <ArrowRight className="h-4 w-4 rotate-180" /> API Key Missing. Please check your .env and restart the server.
                    </div>
                )}

                {isAiReady && (
                    <div className="mb-8 p-2 px-4 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-bold inline-flex items-center gap-2 mb-10">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> AI System Online
                    </div>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleUpload}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="group inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold text-base shadow-lg shadow-blue-500/25 hover:shadow-xl hover:from-blue-600 hover:to-cyan-600 transition-all duration-300 disabled:opacity-60"
                    >
                        {isUploading ? (
                            <><Loader2 className="h-5 w-5 animate-spin" />{t(lang, "analyzing")}</>
                        ) : (
                            <><Upload className="h-5 w-5" />{t(lang, "uploadPdf")}<ArrowRight className="h-4 w-4 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" /></>
                        )}
                    </button>

                    <button
                        onClick={handleTryDemo}
                        className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-base hover:bg-slate-50 hover:border-slate-300 transition-all duration-300"
                    >
                        {t(lang, "tryDemo")}
                    </button>
                </div>
            </section>

            {/* Features */}
            <section className="px-6 pb-20 max-w-5xl mx-auto w-full">
                <h2 className="text-center text-sm font-semibold text-blue-500 uppercase tracking-wider mb-2">
                    {t(lang, "poweredBy")}
                </h2>
                <p className="text-center text-2xl md:text-3xl font-bold text-slate-800 mb-10">
                    {t(lang, "featuresSectionTitle")}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FeatureCard icon={Brain} title={t(lang, "feature1Title")} description={t(lang, "feature1Desc")} />
                    <FeatureCard icon={BarChart3} title={t(lang, "feature2Title")} description={t(lang, "feature2Desc")} />
                    <FeatureCard icon={Heart} title={t(lang, "feature3Title")} description={t(lang, "feature3Desc")} />
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default LandingPage;
