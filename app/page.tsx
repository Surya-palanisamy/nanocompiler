"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Editor, { loader } from "@monaco-editor/react";

if (typeof window !== "undefined") {
  loader.config({ paths: { vs: "/monaco/vs" } });
}
import {
  RotateCw,
  Moon,
  Sun,
  Maximize2,
  Minimize2,
  Share2,
  Check,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Code,
  Terminal,
  Keyboard,
} from "lucide-react";
import { ResizablePanels } from "./components/ResizablePanels";
import { useWindowSize } from "./hooks/useWindowSize";

// Declarations for Pyodide dynamic script loader
declare global {
  interface Window {
    loadPyodide?: (config: {
      indexURL: string;
      stdout?: (msg: string) => void;
      stderr?: (msg: string) => void;
      stdin?: () => string;
    }) => Promise<any>;
  }
}

const DEFAULT_CODE = `# Online Python compiler (interpreter) to run Python online.
# Write Python 3 code in this online editor and run it.
print("Hello, World!")
`;

export default function PythonCompiler() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [stdinVal, setStdinVal] = useState("");
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");

  // Execution states
  const [isRunning, setIsRunning] = useState(false);
  const [execTime, setExecTime] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  // App UI states
  const [isStdinExpanded, setIsStdinExpanded] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mobileActiveView, setMobileActiveView] = useState<"code" | "console">("code");

  const { width } = useWindowSize();
  const isMobile = width < 768;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [pyodideStatus, setPyodideStatus] = useState<
    "idle" | "loading_script" | "initializing" | "ready" | "error"
  >("idle");

  // Pyodide and IO buffers refs
  const pyodideRef = useRef<any>(null);
  const stdoutBufferRef = useRef<string[]>([]);
  const stderrBufferRef = useRef<string[]>([]);
  const stdinBufferRef = useRef<string>("");
  const stdinIndexRef = useRef<number>(0);

  // Sync state values to refs for the Pyodide stdin callback closure
  useEffect(() => {
    stdinBufferRef.current = stdinVal;
  }, [stdinVal]);

  // Load configuration and URL code parameter on mount
  useEffect(() => {
    // Determine active theme
    const savedTheme = localStorage.getItem("python-compiler-theme");
    if (savedTheme === "light") {
      setTheme("light");
    } else {
      setTheme("dark");
    }

    // Determine initial code (URL query param vs LocalStorage vs Default)
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get("code");
    if (codeParam) {
      try {
        const decoded = decodeURIComponent(escape(atob(codeParam)));
        setCode(decoded);
      } catch (e) {
        console.error("Failed to decode code from URL parameter:", e);
      }
    } else {
      const savedCode = localStorage.getItem("python-compiler-code");
      if (savedCode) {
        setCode(savedCode);
      }
    }

    // Stdin restoration
    const savedStdin = localStorage.getItem("python-compiler-stdin");
    if (savedStdin) {
      setStdinVal(savedStdin);
    }
  }, []);

  // Persist code changes
  useEffect(() => {
    localStorage.setItem("python-compiler-code", code);
  }, [code]);

  // Persist stdin changes
  useEffect(() => {
    localStorage.setItem("python-compiler-stdin", stdinVal);
  }, [stdinVal]);

  // Update theme class on HTML element
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      localStorage.setItem("python-compiler-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("python-compiler-theme", "light");
    }
  }, [theme]);

  // Fullscreen event listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Initialize Pyodide instance
  const initPyodideInstance = useCallback(async () => {
    if (!window.loadPyodide) {
      throw new Error("loadPyodide not found on window object");
    }

    const pyInstance = await window.loadPyodide({
      indexURL: "/pyodide/",
      stdout: (text: string) => {
        stdoutBufferRef.current.push(text + "\n");
      },
      stderr: (text: string) => {
        stderrBufferRef.current.push(text + "\n");
      },
      stdin: () => {
        const val = stdinBufferRef.current;
        const idx = stdinIndexRef.current;
        if (idx < val.length) {
          const remaining = val.slice(idx);
          stdinIndexRef.current = val.length;
          // Ensure it ends with a newline so Python's input() completes successfully
          if (!remaining.endsWith("\n")) {
            return remaining + "\n";
          }
          return remaining;
        }
        return ""; // EOF
      },
    });

    pyodideRef.current = pyInstance;
    setPyodideStatus("ready");
    return pyInstance;
  }, []);

  // Lazy-load and initialize Pyodide instance
  const getPyodide = useCallback(async () => {
    if (pyodideRef.current && pyodideStatus === "ready") {
      return pyodideRef.current;
    }

    return new Promise<any>((resolve, reject) => {
      const runInit = async () => {
        try {
          const pyInstance = await initPyodideInstance();
          resolve(pyInstance);
        } catch (err) {
          setPyodideStatus("error");
          reject(err);
        }
      };

      if (window.loadPyodide) {
        setPyodideStatus("initializing");
        runInit();
        return;
      }

      setPyodideStatus("loading_script");
      const script = document.createElement("script");
      script.src = "/pyodide/pyodide.js";
      script.async = true;
      script.onload = () => {
        setPyodideStatus("initializing");
        runInit();
      };
      script.onerror = () => {
        setPyodideStatus("error");
        reject(new Error("Failed to load Pyodide script"));
      };
      document.body.appendChild(script);
    });
  }, [pyodideStatus, initPyodideInstance]);

  // Primary Run Code logic
  const runCode = useCallback(async () => {
    if (isRunning) return;
    if (pyodideStatus === "loading_script" || pyodideStatus === "initializing") {
      return;
    }

    setIsRunning(true);
    if (isMobile) {
      setMobileActiveView("console");
    }
    setStdout("");
    setStderr("");
    setExecTime(null);
    setHasError(false);

    // Reset standard I/O refs
    stdoutBufferRef.current = [];
    stderrBufferRef.current = [];
    stdinIndexRef.current = 0;

    const startTime = performance.now();

    try {
      // Lazy load Pyodide (if not loaded yet)
      const pyInstance = await getPyodide();

      // Auto-load any packages imported in the python script (e.g. numpy)
      await pyInstance.loadPackagesFromImports(code);

      // Execute python code in Pyodide
      await pyInstance.runPythonAsync(code);

      const endTime = performance.now();
      const duration = (endTime - startTime) / 1000;
      setExecTime(duration.toFixed(3) + "s");
    } catch (err: any) {
      const endTime = performance.now();
      const duration = (endTime - startTime) / 1000;
      setExecTime(duration.toFixed(3) + "s");
      setHasError(true);

      const errMsg = err.message || String(err);
      if (!stderrBufferRef.current.some((m) => errMsg.includes(m))) {
        stderrBufferRef.current.push(errMsg);
      }
    } finally {
      setStdout(stdoutBufferRef.current.join(""));
      setStderr(stderrBufferRef.current.join(""));
      setIsRunning(false);
    }
  }, [code, isRunning, pyodideStatus, isMobile, getPyodide]);

  // Bind Keyboard Shortcut Ctrl+Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runCode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [runCode]);

  // Reset editor template
  const handleReset = () => {
      setCode(DEFAULT_CODE);
      setStdout("");
      setStderr("");
      setExecTime(null);
      setHasError(false);
  };

  // Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error("Error entering fullscreen mode:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Share base64 encoded URL
  const handleShare = () => {
    try {
      const base64Code = btoa(unescape(encodeURIComponent(code)));
      const shareUrl = `${window.location.origin}${window.location.pathname}?code=${base64Code}`;
      navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (err) {
      console.error("Could not share code:", err);
    }
  };

  // Clear Output tab
  const handleClearOutput = () => {
    setStdout("");
    setStderr("");
    setExecTime(null);
    setHasError(false);
  };

  // Register rich python autocompletions when Monaco mounts
  const handleEditorDidMount = (editor: any, monaco: any) => {
    monaco.languages.registerCompletionItemProvider("python", {
      provideCompletionItems: (model: any, position: any) => {
        if (typeof window !== "undefined" && window.innerWidth < 768) {
          return { suggestions: [] };
        }
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions = [
          {
            label: "for loop",
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "for ${1:i} in range(${2:10}):\n\t${3:pass}",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Standard Python for-in range loop",
            range: range,
          },
          {
            label: "def function",
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "def ${1:func_name}(${2:args}):\n\t${3:pass}",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Python def function statement",
            range: range,
          },
          {
            label: "class",
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "class ${1:ClassName}:\n\tdef __init__(self):\n\t\t${2:pass}",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Python class block definition",
            range: range,
          },
          {
            label: "if __name__ == '__main__':",
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "if __name__ == '__main__':\n\t${1:pass}",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Python script entry check pattern",
            range: range,
          },
          {
            label: "try-except",
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:e}:\n\t${4:print(e)}",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Python try-except error catching block",
            range: range,
          },
          {
            label: "list comprehension",
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "[${1:x} for ${2:x} in ${3:iterable}]",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Python inline list comprehension statement",
            range: range,
          },
          {
            label: "print",
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "print(${1:\"Hello\"})",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Prints messages to standard stdout",
            range: range,
          },
          {
            label: "input",
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "input(${1:\"Enter: \"})",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Reads input string from standard input",
            range: range,
          }
        ];

        return { suggestions };
      },
    });
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-zinc-100 text-zinc-900 transition-colors duration-200 dark:bg-zinc-950 dark:text-zinc-100 select-none">
      <main className="w-full h-full overflow-hidden flex flex-col">
        <ResizablePanels
          left={
            <div className="h-full w-full flex flex-col overflow-hidden">

              {/* Left Panel Header */}
              <div className="h-12 flex items-center justify-between px-3 sm:px-4 border-b bg-white dark:bg-[#151515] border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white shrink-0 select-none">
                <div className="flex items-center justify-between w-full h-full">
                  
                  {/* Left Side: Title & Action Icons */}
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {/* Responsive Title */}
                    <span className="hidden sm:inline text-[19px] font-bold text-zinc-900 dark:text-white select-none mr-2 truncate">
                      Nano Compiler
                    </span>

                    {/* Action Icons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={handleReset}
                        title="Reset code template"
                        className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all active:scale-95 cursor-pointer"
                      >
                        <RotateCw className="h-4.5 w-4.5" />
                      </button>

                      <button
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                        title={`Switch to ${theme === "dark" ? "Light" : "Dark"} mode`}
                        className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all active:scale-95 cursor-pointer"
                      >
                        {theme === "dark" ? (
                          <Sun className="h-4.5 w-4.5" />
                        ) : (
                          <Moon className="h-4.5 w-4.5" />
                        )}
                      </button>

                      <button
                        onClick={toggleFullscreen}
                        title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                        className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all active:scale-95 cursor-pointer"
                      >
                        {isFullscreen ? (
                          <Minimize2 className="h-4.5 w-4.5" />
                        ) : (
                          <Maximize2 className="h-4.5 w-4.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Right Side: Share & Run Code Buttons */}
                  <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                    {/* Share button */}
                    <button
                      onClick={handleShare}
                      className="h-[34px] flex items-center gap-1.5 px-2.5 sm:px-3 rounded-[6px] text-xs font-semibold bg-white dark:bg-[#1e1e1e] hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-850 dark:text-zinc-200 transition-all active:scale-98 select-none cursor-pointer"
                    >
                      {shareCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="text-emerald-500 font-bold hidden sm:inline">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="h-3.5 w-3.5" />
                          <span className="font-bold hidden sm:inline">Share</span>
                        </>
                      )}
                    </button>

                    {/* Run Code Button */}
                    <button
                      onClick={runCode}
                      disabled={isRunning || pyodideStatus === "loading_script" || pyodideStatus === "initializing"}
                      className="h-[34px] flex items-center px-3 sm:px-4.5 text-xs font-bold bg-zinc-900 text-white dark:bg-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all rounded-[6px] shadow-sm select-none active:scale-95 disabled:bg-zinc-200 dark:disabled:bg-zinc-850 disabled:text-zinc-400 dark:disabled:text-zinc-500 disabled:scale-100 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          <span className="hidden sm:inline">Running...</span>
                          <span className="sm:hidden">...</span>
                        </>
                      ) : (
                        <>
                          <span className="hidden sm:inline">Run Code</span>
                          <span className="sm:hidden">Run</span>
                        </>
                      )}
                    </button>

                  </div>

                </div>
              </div>

              {/* Monaco Editor Container */}
              <div className="flex-1 w-full bg-white dark:bg-[#1e1e1e] overflow-hidden">
                <Editor
                  height="100%"
                  language="python"
                  theme={theme === "dark" ? "vs-dark" : "vs"}
                  value={code}
                  onChange={(val) => setCode(val || "")}
                  onMount={handleEditorDidMount}
                  loading={
                    <div className="flex h-full w-full flex-col items-center justify-center bg-[#1e1e1e] text-zinc-500 font-sans text-xs">
                      <Loader2 className="h-8 w-8 animate-spin text-violet-500 mb-2" />
                      <span>Loading Monaco Editor...</span>
                    </div>
                  }
                  options={{
                    minimap: { enabled: false },
                    fontSize: isMobile ? 15 : 17,
                    fontFamily: '"Lexend Deca"',
                    lineHeight: isMobile ? 24 : 27.55,
                    padding: { top: 12, bottom: 12 },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 4,
                    insertSpaces: true,
                    cursorBlinking: "blink",
                    cursorSmoothCaretAnimation: "on",
                    smoothScrolling: true,
                    lineNumbers: "on",
                    glyphMargin: false,
                    folding: !isMobile,
                    lineNumbersMinChars: 3,
                    renderLineHighlight: "all",
                    quickSuggestions: !isMobile ? {
                      other: true,
                      comments: false,
                      strings: false,
                    } : false,
                    suggestOnTriggerCharacters: !isMobile,
                    acceptSuggestionOnEnter: !isMobile ? "on" : "off",
                    tabCompletion: !isMobile ? "on" : "off",
                    wordBasedSuggestions: !isMobile ? "allDocuments" : "off",
                    parameterHints: { enabled: !isMobile },
                    scrollbar: {
                      vertical: "hidden",
                      horizontal: "hidden",
                    },
                  }}
                />
              </div>
            </div>
          }
          right={
            <div className="h-full w-full flex flex-col overflow-hidden bg-[#fcfcfc] dark:bg-[#121212]">

              {/* Right Panel Header */}
              <div className="h-12 flex items-center justify-between px-5 border-b bg-white dark:bg-[#151515] border-zinc-200 dark:border-zinc-800 shrink-0 select-none">
                <span className="text-[15px] font-bold tracking-wide text-zinc-800 dark:text-zinc-200">
                  Execution Console
                </span>
                {(stdout || stderr || execTime) && (
                  <button
                    onClick={handleClearOutput}
                    className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Clear Console</span>
                  </button>
                )}
              </div>

              {/* Output Terminal Area */}
              <div className="flex-1 p-5 overflow-y-auto font-mono text-[19px] leading-[27.55px] bg-[#fafafa] text-zinc-900 dark:bg-[#121212] dark:text-zinc-200">
                {isRunning ? (
                  <div className="flex flex-col h-full w-full items-center justify-center text-zinc-500 py-10 font-sans text-xs">
                    <Loader2 className="h-6 w-6 animate-spin text-violet-500 mb-2" />
                    <span>Running Python script...</span>
                  </div>
                ) : (pyodideStatus === "loading_script" || pyodideStatus === "initializing") ? (
                  <div className="flex flex-col h-full w-full items-center justify-center text-zinc-500 py-10 font-sans text-xs text-center px-4">
                    <Loader2 className="h-6 w-6 animate-spin text-violet-500 mb-2" />
                    <span>Initializing python runner environment. This may take 5-10 seconds on first run...</span>
                  </div>
                ) : !stdout && !stderr ? (
                  <span className="text-zinc-500 italic select-none">
                    No execution output. Click "Run Code" above 
                  </span>
                ) : (
                  <div className="whitespace-pre-wrap select-text">
                    {stdout && <div className="text-zinc-900 dark:text-zinc-200">{stdout}</div>}
                    {stderr && (
                      <div className="text-rose-500 dark:text-rose-400 mt-2 p-3 rounded bg-rose-950/20 border border-rose-900/30">
                        {stderr}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Output Execution Status Footer */}
              {execTime && !isRunning && (
                <footer className="flex items-center justify-between px-5 py-2 text-xs border-t bg-zinc-50 border-zinc-200 text-zinc-500 dark:bg-[#151515] dark:border-zinc-800 dark:text-zinc-400 shrink-0 select-none">
                  <div className="flex items-center gap-1.5">
                    {hasError ? (
                      <>
                        <AlertCircle className="h-4 w-4 text-rose-500" />
                        <span className="text-rose-500 font-semibold">Failed with errors</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-emerald-500 font-semibold">Success</span>
                      </>
                    )}
                  </div>
                  <div className="font-mono">
                    Execution time: <span className="font-semibold text-zinc-900 dark:text-white">{execTime}</span>
                  </div>
                </footer>
              )}

              {/* Standard Input Area */}
              <div className={`border-t border-zinc-200 dark:border-zinc-800 flex flex-col shrink-0 bg-white dark:bg-[#151515] transition-all duration-150 ${isStdinExpanded ? "h-36" : "h-8"}`}>
                <button
                  onClick={() => setIsStdinExpanded(!isStdinExpanded)}
                  className="h-8 flex items-center justify-between px-5 bg-zinc-50 dark:bg-[#181818] border-b border-zinc-150 dark:border-zinc-800 text-[11px] font-bold tracking-wider text-zinc-450 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors select-none cursor-pointer w-full text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <Keyboard className="h-3.5 w-3.5" />
                    <span>STANDARD INPUT (STDIN)</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    {isStdinExpanded ? "Collapse ▲" : "Expand ▼"}
                  </span>
                </button>
                {isStdinExpanded && (
                  <textarea
                    value={stdinVal}
                    onChange={(e) => setStdinVal(e.target.value)}
                    placeholder="Type program input values here (one per line, if your program calls input() multiple times)..."
                    className="w-full flex-1 p-3 bg-white text-zinc-900 dark:bg-[#151515] dark:text-zinc-100 text-[16px] leading-[24px] font-mono resize-none focus:outline-none border-none outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                  />
                )}
              </div>
            </div>
          }
        />
      </main>
    </div>
  );
}
