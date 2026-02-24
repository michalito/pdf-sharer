import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--app-panel-strong)",
            border: "1px solid var(--app-border)",
            color: "var(--app-text)",
            boxShadow: "0 14px 34px rgba(12, 8, 5, 0.22)",
          },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
);
