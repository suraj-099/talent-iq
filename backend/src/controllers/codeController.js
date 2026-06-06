import { execFile } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";

const EXECUTION_TIMEOUT_MS = 10000;

const LANGUAGE_CONFIG = {
  javascript: {
    filename: "main.js",
    command: process.execPath,
    args: ["main.js"],
  },
  python: {
    filename: "main.py",
    command: process.platform === "win32" ? "python" : "python3",
    args: ["main.py"],
  },
  java: {
    filename: "Solution.java",
    command: "java",
    args: ["Solution"],
    compileCommand: "javac",
    compileArgs: ["Solution.java"],
  },
};

function runCommand(command, args, cwd) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd,
        timeout: EXECUTION_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        resolve({
          error,
          stdout,
          stderr,
        });
      }
    );
  });
}

function formatExecutionError(error, stderr) {
  if (stderr) return stderr;
  if (!error) return "";
  if (error.killed) return "Execution timed out.";
  if (error.code === "ENOENT") return "Runtime is not installed on this machine.";
  return error.message;
}

export async function executeCode(req, res) {
  const { language, code } = req.body;
  const config = LANGUAGE_CONFIG[language];

  if (!config) {
    return res.status(400).json({ success: false, error: `Unsupported language: ${language}` });
  }

  if (!code || typeof code !== "string") {
    return res.status(400).json({ success: false, error: "Code is required" });
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "talent-iq-code-"));

  try {
    await writeFile(path.join(tempDir, config.filename), code, "utf8");

    if (config.compileCommand) {
      const compileResult = await runCommand(config.compileCommand, config.compileArgs, tempDir);
      if (compileResult.error || compileResult.stderr) {
        return res.status(200).json({
          success: false,
          output: compileResult.stdout,
          error: formatExecutionError(compileResult.error, compileResult.stderr),
        });
      }
    }

    const result = await runCommand(config.command, config.args, tempDir);
    const error = formatExecutionError(result.error, result.stderr);

    return res.status(200).json({
      success: !error,
      output: result.stdout || "No output",
      error,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to execute code: ${error.message}`,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
