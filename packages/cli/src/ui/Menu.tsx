import React, { useState } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import { printBanner } from "./banner.js";

interface MenuOption {
  label: string;
  value: string;
}

const options: MenuOption[] = [
  { value: "scan",    label: "Scan an endpoint" },
  { value: "audit",   label: "Audit an npm package" },
  { value: "review",  label: "Review a codebase" },
  { value: "dashboard", label: "Open local mission control" },
  { value: "doctor",  label: "Check runtimes and setup" },
  { value: "replay",  label: "Replay the last scan" },
  { value: "history", label: "View past results" },
];

type Phase = "menu" | "input";

function Menu({ onSelect }: { onSelect: (action: string, target?: string) => void }): React.ReactElement {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>("menu");
  const [selected, setSelected] = useState(0);
  const [action, setAction] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [inputLabel, setInputLabel] = useState("");

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      exit();
      return;
    }

    if (phase === "menu") {
      if (key.upArrow) setSelected((s) => Math.max(0, s - 1));
      if (key.downArrow) setSelected((s) => Math.min(options.length - 1, s + 1));
      if (key.return) {
        const opt = options[selected].value;
        if (opt === "history" || opt === "doctor" || opt === "replay" || opt === "dashboard") {
          onSelect(opt);
          return;
        }
        setAction(opt);
        setPhase("input");
        if (opt === "scan") {
          setInputLabel("Target URL");
          setPlaceholder("https://api.example.com/v1");
        } else if (opt === "audit") {
          setInputLabel("Package name");
          setPlaceholder("express");
        } else if (opt === "review") {
          setInputLabel("Repo path or URL");
          setPlaceholder("./my-project");
        }
      }
    } else if (phase === "input") {
      if (key.return) {
        if (inputValue.trim()) {
          onSelect(action, inputValue.trim());
        }
        return;
      }
      if (key.backspace || key.delete) {
        setInputValue((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setInputValue((v) => v + input);
      }
    }
  });

  return (
    <Box flexDirection="column" paddingLeft={1}>
      {phase === "menu" && (
        <Box flexDirection="column">
          <Text color="gray" dimColor>  What would you like to do?</Text>
          <Text> </Text>
          {options.map((opt, i) => (
            <Box key={opt.value}>
              <Text color={i === selected ? "red" : "gray"}>
                {i === selected ? " ❯ " : "   "}
              </Text>
              <Text color={i === selected ? "white" : "gray"} bold={i === selected}>
                {opt.label}
              </Text>
            </Box>
          ))}
          <Text> </Text>
          <Text color="gray" dimColor>  ↑↓ navigate  ⏎ select  esc quit</Text>
        </Box>
      )}

      {phase === "input" && (
        <Box flexDirection="column">
          <Box>
            <Text color="gray">{inputLabel}: </Text>
            <Text color="white" bold>{inputValue}</Text>
            <Text color="gray" dimColor>{inputValue.length === 0 ? placeholder : ""}</Text>
            <Text color="red">█</Text>
          </Box>
          <Text> </Text>
          <Text color="gray" dimColor>  ⏎ confirm  esc quit</Text>
        </Box>
      )}
    </Box>
  );
}

export function showInkMenu(): Promise<{ action: string; target?: string }> {
  // Print shared banner before Ink takes over
  printBanner();

  return new Promise((resolve) => {
    const instance = render(
      <Menu onSelect={(action, target) => {
        instance.unmount();
        resolve({ action, target });
      }} />
    );
  });
}
