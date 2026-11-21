export const THEME_STORAGE_KEY = "levito-theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}")||"dark";var d=t==="dark"||(t==="system"&&matchMedia("${DARK_QUERY}").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;
