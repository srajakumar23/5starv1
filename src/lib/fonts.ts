import localFont from "next/font/local";

export const outfit = localFont({
    src: [
        {
            path: "../../public/fonts/outfit-latin.woff2",
            weight: "100 900",
            style: "normal",
        },
    ],
    display: "swap",
    variable: "--font-outfit",
    adjustFontFallback: "Arial",
    preload: true,
});
