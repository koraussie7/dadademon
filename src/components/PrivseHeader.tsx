import { NavLink } from "react-router-dom";
import { useI18n } from "@/lib/i18n";

interface LocaleOption {
  code: "en" | "ko" | "ja" | "zh";
  label: string;
  flag: string;
}

const localeOptions: LocaleOption[] = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
];

const navItems = [
  { path: "/", label: "Home", icon: "🏠" },
  { path: "/hub", label: "Discover", icon: "🔍" },
  { path: "/events", label: "Shorts", icon: "🎬" },
  { path: "/chat", label: "Chat", icon: "💬" },
  { path: "/collection", label: "Collection", icon: "📸" },
  { path: "/studio", label: "Create Character", icon: "✨" },
  { path: "/library", label: "My AI", icon: "🧠" },
  { path: "/settings", label: "Private Content", icon: "🔒" },
  { path: "/pricing", label: "Premium", icon: "💎" },
  { path: "/templates", label: "Templates", icon: "📋" },
  { path: "/messages", label: "Message Center", icon: "✉️" },
  { path: "/commits", label: "Commits", icon: "📝" },
] as const;

export function PrivseHeader() {
  const { locale, setLocale } = useI18n();

  return (
    <header className="bg-[#0e0f17] border-b border-white/10 sticky top-0 z-50">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        {/* Logo */}
        <NavLink to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-candy-gradient flex items-center justify-center text-lg shadow-md shadow-pink-500/20 shrink-0">
            🍬
          </div>
          <span className="font-extrabold text-lg tracking-wide text-white hidden sm:inline">
            PRIVSEAI
            <span className="text-pink-400"> CANDY</span>
          </span>
        </NavLink>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-white border border-pink-500/30 shadow-md shadow-pink-500/5"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Language selector */}
          <div className="flex items-center gap-1 border border-white/10 rounded-lg p-0.5 bg-white/[0.02]">
            {localeOptions.map((opt) => (
              <button
                key={opt.code}
                onClick={() => setLocale(opt.code)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  locale === opt.code
                    ? "bg-white/15 text-white shadow-sm"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
                title={opt.label}
              >
                <span className="mr-1">{opt.flag}</span>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Legal info */}
          <a
            href="/legal-information"
            className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors hidden sm:block"
          >
            Legal
          </a>
        </div>
      </div>
    </header>
  );
}
