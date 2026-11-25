import { createRoot } from "react-dom/client";
import "@fontsource/caveat/500.css";
import "@fontsource/nanum-pen-script/400.css";
import "@fontsource/vt323/400.css";
import "./tokens.css";
import "./styles.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
