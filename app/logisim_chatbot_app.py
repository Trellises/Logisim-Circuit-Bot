"""
Logisim Circuit Bot — CSCI-335 desktop assistant
=================================================
A chat-style desktop app (no browser involved) that:
  1. Understands what circuit you want (typed or via quick buttons)
  2. Draws it as a LIVE, clickable diagram -- click an input pin and watch
     the wires and outputs actually recompute, right there in the window
  3. Saves a ready-to-open Logisim (.circ) file when you're happy with it

Run it with:
    pip install customtkinter matplotlib
    python logisim_chatbot_app.py

Everything here is free and runs entirely on your machine -- no API key,
no account, no internet connection required. (There's an optional free
Gemini hook for looser natural-language matching -- see USE_GEMINI below --
but it's off by default and the app works fully without it.)
"""

import re
import tkinter as tk
from tkinter import filedialog, messagebox

import customtkinter as ctk
import matplotlib
matplotlib.use("TkAgg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.patches import FancyBboxPatch, Circle

from circuits import (CIRCUIT_DATA, CIRC_XML, META, CHIP_LIST, BUILD_STEPS, GATE_INFO,
                       simulate, gate_ports, build_stages)


USE_GEMINI = False

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("dark-blue")

TRACE = "#6EE7C8"
AMBER = "#FFB454"
OFF = "#22384E"
PANEL = "#101F32"
PANEL2 = "#0D1A2A"
TEXT = "#E8F1F7"
MUTED = "#7E97AC"


def local_match(text):
    t = text.lower()
    if re.search(r"\balu\b", t):
        return "alu_4bit"
    if re.search(r"\b(4|four)[\s-]?bit\s+adder\b|\bripple[\s-]?carry\b", t):
        return "adder_4bit"
    if re.search(r"\bhalf[\s-]?adder\b", t):
        return "half_adder"
    if re.search(r"\bfull[\s-]?adder\b", t):
        return "full_adder"
    if re.search(r"\bmux\b|\bmultiplexer\b", t):
        return "mux_2to1"
    if re.search(r"\bxor\b|exclusive.?or", t):
        return "xor_gate"
    if re.search(r"\bnot\s+gate\b|inverter", t):
        return "not_gate"
    if re.search(r"\band\s+gate\b", t):
        return "and_gate"
    if re.search(r"\bor\s+gate\b", t):
        return "or_gate"
    return None


def describe_match(text):
    """True if the student is asking HOW TO BUILD something, not just to see it."""
    return re.search(r"\bdescribe\b|\bexplain\b|\bhow (do i|to) (build|make)\b", text.lower()) is not None


def concept_match(text):
    """True if the student is asking WHAT something IS/DOES, not how to build it.
    Takes priority over describe_match (e.g. "explain what an AND gate does")."""
    return re.search(r"\bwhat\b.*\b(is|does|are|do)\b|\bwhat'?s\b", text.lower()) is not None


def gemini_match(text):
    """Optional: ask free-tier Gemini to match looser phrasing to a template.
    Only called if USE_GEMINI is True and GEMINI_API_KEY is set."""
    import os
    import google.generativeai as genai

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")
    prompt = (
        "You are matching a student's request to one of these circuit keys: "
        + ", ".join(CHIP_LIST)
        + ". Reply with ONLY the single best matching key, or the word 'none' "
        "if nothing fits. Student request: " + text
    )
    resp = model.generate_content(prompt)
    key = resp.text.strip().lower()
    return key if key in CHIP_LIST else None


class CircuitCanvas(ctk.CTkFrame):
    """Embedded matplotlib figure that draws a circuit and lets the student
    click input pins to toggle them, live-recomputing every gate and wire."""

    def __init__(self, master, **kwargs):
        super().__init__(master, fg_color=PANEL2, **kwargs)
        self.key = None
        self.values = {}
        self.stages = []
        self.stage_idx = 0
        self.fig = plt.figure(figsize=(9.2, 5.8), facecolor=PANEL2)
        self.ax = self.fig.add_subplot(111)
        self.canvas = FigureCanvasTkAgg(self.fig, master=self)
        self.canvas.get_tk_widget().pack(fill="both", expand=True, padx=6, pady=6)
        self.canvas.mpl_connect("button_press_event", self._on_click)
        self._draw_placeholder()

    def _draw_placeholder(self):
        self.ax.clear()
        self.ax.set_facecolor(PANEL2)
        self.ax.axis("off")
        self.ax.text(0.5, 0.5, "no circuit selected yet\npick one from the chat",
                     ha="center", va="center", color=MUTED, fontsize=11,
                     family="monospace", transform=self.ax.transAxes)
        self.canvas.draw_idle()

    def show_circuit(self, key):
        self.key = key
        d = CIRCUIT_DATA[key]
        self.values = {c["label"]: 0 for c in d["components"]
                       if c["kind"] == "pin" and not c.get("output")}
        self.stages = build_stages(key)
        self.stage_idx = 0
        self._redraw()

    # ---------------- build-animation navigation ----------------
    def stage_count(self):
        return len(self.stages)

    def is_final_stage(self):
        return bool(self.stages) and self.stage_idx == len(self.stages) - 1

    def current_caption(self):
        return self.stages[self.stage_idx]["caption"] if self.stages else ""

    def next_stage(self):
        """Advances the stage index WITHOUT rendering -- the caller (App)
        drives rendering via render()/flash so it can pop-in the new part
        before settling it, rather than snapping straight to the settled
        look."""
        if not self.stages or self.stage_idx >= len(self.stages) - 1:
            return False
        self.stage_idx += 1
        return True

    def render(self, flash=False):
        self._redraw(flash=flash)

    def prev_stage(self):
        if not self.stages or self.stage_idx <= 0:
            return False
        self.stage_idx -= 1
        self._redraw()
        return True

    def goto_stage(self, idx):
        if not self.stages:
            return
        self.stage_idx = max(0, min(idx, len(self.stages) - 1))
        self._redraw()

    def reset_stage(self):
        """Like goto_stage(0) but skips the render -- used when restarting
        Play from the finished circuit, so the caller can flash-reveal
        stage 0 instead of it snapping in instantly."""
        self.stage_idx = 0

    # ---------------- rendering ----------------
    def _redraw(self, flash=False):
        if self.key is None:
            return
        if self.stages and self.stage_idx < len(self.stages) - 1:
            self._redraw_partial(flash=flash)
        else:
            self._redraw_final()

    FLASH_COLOR = "#FFE9B0"

    def _redraw_partial(self, flash=False):
        """Mid-build view: shows only what's been placed through the current
        stage. The single part just introduced pops in with a bright flash
        (a glow halo + thick hot-amber outline) that settles to normal amber
        a beat later; everything placed earlier is a dim, neutral tone. No
        logic values are shown -- the circuit isn't complete enough to mean
        anything yet -- and pins aren't clickable until the build finishes."""
        d = CIRCUIT_DATA[self.key]
        W, H = d["size"]

        self.ax.clear()
        self.ax.set_facecolor(PANEL2)
        self.ax.set_xlim(0, W)
        self.ax.set_ylim(H, 0)
        self.ax.axis("off")

        placed = self.stages[: self.stage_idx + 1]
        newest = placed[-1]
        settled_wires = [w for s in placed[:-1] for w in s["wires"]]
        settled_comps = [c for s in placed[:-1] for c in s["components"]]

        hot = self.FLASH_COLOR if flash else AMBER

        for (p1, p2) in settled_wires:
            self.ax.plot([p1[0], p2[0]], [p1[1], p2[1]], color="#3A5568",
                         linewidth=1.6, solid_capstyle="round", zorder=1)
        for (p1, p2) in newest["wires"]:
            self.ax.plot([p1[0], p2[0]], [p1[1], p2[1]], color=hot,
                         linewidth=4.0 if flash else 2.8, solid_capstyle="round", zorder=1)

        self._pin_points = []  # not interactive mid-build

        def draw_component(c, is_new):
            x, y = c["loc"]
            if c["kind"] == "pin":
                edge = hot if is_new else TRACE
                fill = "#1B3350" if is_new else OFF
                if is_new and flash:
                    self.ax.add_patch(Circle((x, y), 14, facecolor=hot, edgecolor="none",
                                              alpha=0.30, zorder=2))
                self.ax.add_patch(Circle((x, y), 7, facecolor=fill, edgecolor=edge,
                                          linewidth=3.2 if (is_new and flash) else (2.2 if is_new else 1.5),
                                          zorder=3))
                self.ax.text(x, y - 16, c["label"], ha="center", va="center",
                             color=TEXT if is_new else MUTED, fontsize=9,
                             family="monospace", zorder=4)
            else:
                is_not = c["kind"] == "NOT"
                width = 42 if is_not else 70
                height = 42 if is_not else 62
                lw = (4.4 if flash else 2.6) if is_new else 1.3
                face = "#1B3350" if is_new else PANEL
                if is_new and flash:
                    self.ax.add_patch(FancyBboxPatch(
                        (x - width - 7, y - height / 2 - 7), width + 14, height + 14,
                        boxstyle="round,pad=0,rounding_size=9", linewidth=0,
                        facecolor=hot, alpha=0.28, zorder=1.5))
                box = FancyBboxPatch((x - width, y - height / 2), width, height,
                                      boxstyle="round,pad=0,rounding_size=4",
                                      linewidth=lw, edgecolor=hot if is_new else AMBER,
                                      facecolor=face, zorder=2)
                self.ax.add_patch(box)
                symbol = {"AND": "&", "OR": "≥1", "XOR": "=1", "NOT": "1"}[c["kind"]]
                self.ax.text(x - width / 2, y, symbol, ha="center", va="center",
                             color=hot if is_new else MUTED, fontsize=16,
                             family="monospace", zorder=3)
                if is_not:
                    self.ax.add_patch(Circle((x + 6, y), 5, facecolor=PANEL2,
                                              edgecolor=hot if is_new else AMBER, linewidth=lw, zorder=3))

        for c in settled_comps:
            draw_component(c, is_new=False)
        for c in newest["components"]:
            draw_component(c, is_new=True)
            if c["kind"] != "pin":
                x, y = c["loc"]
                width = 42 if c["kind"] == "NOT" else 70
                height = 42 if c["kind"] == "NOT" else 62
                self.ax.text(x - width, y - height / 2 - 8, f"#{newest['tag']}",
                             ha="left", va="bottom", color=hot, fontsize=9,
                             family="monospace", fontweight="bold", zorder=5)

        self.canvas.draw_idle()

    def _redraw_final(self):
        d = CIRCUIT_DATA[self.key]
        uf, net_value = simulate(self.key, self.values)
        W, H = d["size"]

        self.ax.clear()
        self.ax.set_facecolor(PANEL2)
        self.ax.set_xlim(0, W)
        self.ax.set_ylim(H, 0)  # flip y to match the original layout orientation
        self.ax.axis("off")

        for (p1, p2) in d["wires"]:
            v = net_value.get(uf.find(tuple(p1)))
            color = TRACE if v == 1 else OFF
            lw = 2.6 if v == 1 else 1.8
            self.ax.plot([p1[0], p2[0]], [p1[1], p2[1]], color=color, linewidth=lw,
                         solid_capstyle="round", zorder=1)

        self._pin_points = []  # (x, y, label) for input pins, for click hit-testing

        for c in d["components"]:
            x, y = c["loc"]
            if c["kind"] == "pin":
                is_input = not c.get("output")
                if is_input:
                    v = self.values.get(c["label"], 0)
                    self._pin_points.append((x, y, c["label"]))
                else:
                    v = net_value.get(uf.find((x, y)))
                fill = TRACE if v == 1 else OFF
                edge = TRACE if is_input else AMBER
                self.ax.add_patch(Circle((x, y), 7, facecolor=fill, edgecolor=edge,
                                          linewidth=1.5, zorder=3))
                self.ax.text(x, y - 16, c["label"], ha="center", va="center",
                             color=MUTED, fontsize=9, family="monospace", zorder=4)
                val_color = TRACE if v == 1 else "#4E657A"
                self.ax.text(x, y + 20, "?" if v is None else str(v), ha="center",
                             va="center", color=val_color, fontsize=10,
                             family="monospace", fontweight="bold", zorder=4)
            else:
                is_not = c["kind"] == "NOT"
                width = 42 if is_not else 70
                height = 42 if is_not else 62
                box = FancyBboxPatch((x - width, y - height / 2), width, height,
                                      boxstyle="round,pad=0,rounding_size=4",
                                      linewidth=1.5, edgecolor=AMBER,
                                      facecolor=PANEL, zorder=2)
                self.ax.add_patch(box)
                symbol = {"AND": "&", "OR": "\u22651", "XOR": "=1", "NOT": "1"}[c["kind"]]
                self.ax.text(x - width / 2, y, symbol, ha="center", va="center",
                             color=AMBER, fontsize=16, family="monospace", zorder=3)
                if is_not:
                    self.ax.add_patch(Circle((x + 6, y), 5, facecolor=PANEL2,
                                              edgecolor=AMBER, linewidth=1.5, zorder=3))

        self.canvas.draw_idle()

    def _on_click(self, event):
        if event.xdata is None or event.ydata is None or self.key is None:
            return
        for (x, y, label) in getattr(self, "_pin_points", []):
            if (event.xdata - x) ** 2 + (event.ydata - y) ** 2 <= 14 ** 2:
                self.values[label] = 0 if self.values.get(label, 0) else 1
                self._redraw()
                return


class LogisimChatbotApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Logisim Circuit Bot -- CSCI-335")
        self.geometry("1500x820")
        self.configure(fg_color="#0B1826")

        self.playing = False
        self.play_job = None
        self.flash_job = None
        self._speed_idx = 0
        self.play_delay_ms = 900

        self._build_layout()
        self._welcome()

    # ---------------- layout ----------------
    def _build_layout(self):
        header = ctk.CTkFrame(self, fg_color=PANEL, height=52, corner_radius=8)
        header.pack(fill="x", padx=14, pady=(14, 8))
        ctk.CTkLabel(header, text="\u25CF Logisim Circuit Bot", font=("Consolas", 15, "bold"),
                     text_color=TRACE).pack(side="left", padx=14, pady=10)
        ctk.CTkLabel(header, text="CSCI-335 \u00b7 Tuskegee \u00b7 runs 100% locally",
                     font=("Consolas", 11), text_color=MUTED).pack(side="left", pady=10)

        body = tk.PanedWindow(self, orient="horizontal", sashwidth=6, sashpad=0,
                               sashrelief="flat", bg="#0B1826", bd=0,
                               opaqueresize=True)
        body.pack(fill="both", expand=True, padx=14, pady=(0, 14))

        # ---- left: chat ----
        left = ctk.CTkFrame(body, fg_color=PANEL, corner_radius=8)
        left.grid_rowconfigure(0, weight=1)
        left.grid_columnconfigure(0, weight=1)

        self.log = ctk.CTkTextbox(left, fg_color=PANEL2, text_color=TEXT,
                                   font=("Consolas", 12), wrap="word", corner_radius=6)
        self.log.grid(row=0, column=0, sticky="nsew", padx=10, pady=(10, 6))
        self.log.configure(state="disabled")

        input_row = ctk.CTkFrame(left, fg_color="transparent")
        input_row.grid(row=1, column=0, sticky="ew", padx=10, pady=(0, 10))
        input_row.grid_columnconfigure(0, weight=1)
        self.entry = ctk.CTkEntry(input_row, placeholder_text="Describe the circuit you need...",
                                   font=("Consolas", 12), fg_color=PANEL2, border_color="#17293D")
        self.entry.grid(row=0, column=0, sticky="ew", padx=(0, 6))
        self.entry.bind("<Return>", lambda e: self._on_send())
        ctk.CTkButton(input_row, text="Send", width=70, fg_color=TRACE, text_color="#0B1826",
                       hover_color="#57C9AE", font=("Consolas", 12, "bold"),
                       command=self._on_send).grid(row=0, column=1)

        # ---- right: live circuit + actions ----
        right = ctk.CTkFrame(body, fg_color=PANEL, corner_radius=8)
        right.grid_rowconfigure(1, weight=1)
        right.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(right, text="// watch it build, then click a pin to toggle it",
                     font=("Consolas", 11), text_color=TRACE).grid(
            row=0, column=0, sticky="w", padx=12, pady=(10, 2))

        self.canvas_frame = CircuitCanvas(right)
        self.canvas_frame.grid(row=1, column=0, sticky="nsew", padx=10, pady=4)

        self.stage_caption_label = ctk.CTkLabel(right, text="", font=("Consolas", 11.5),
                                                 text_color=AMBER, justify="left", anchor="w",
                                                 wraplength=640)
        self.stage_caption_label.grid(row=2, column=0, sticky="ew", padx=12, pady=(4, 0))

        build_row = ctk.CTkFrame(right, fg_color="transparent")
        build_row.grid(row=3, column=0, sticky="ew", padx=10, pady=(4, 6))
        self.prev_btn = ctk.CTkButton(build_row, text="◀", width=32, fg_color=PANEL2,
                                       hover_color="#173049", text_color=TRACE,
                                       height=26, corner_radius=5, command=self._step_prev,
                                       state="disabled")
        self.prev_btn.pack(side="left", padx=(0, 4))
        self.play_btn = ctk.CTkButton(build_row, text="▶ Play", width=84, fg_color=TRACE,
                                       hover_color="#57C9AE", text_color="#0B1826",
                                       font=("Consolas", 11, "bold"), height=26, corner_radius=5,
                                       command=self._toggle_play, state="disabled")
        self.play_btn.pack(side="left", padx=4)
        self.next_btn = ctk.CTkButton(build_row, text="▶", width=32, fg_color=PANEL2,
                                       hover_color="#173049", text_color=TRACE,
                                       height=26, corner_radius=5, command=self._step_next,
                                       state="disabled")
        self.next_btn.pack(side="left", padx=4)
        self.skip_btn = ctk.CTkButton(build_row, text="Skip to end ⏭", width=110,
                                       fg_color=PANEL2, hover_color="#173049", text_color=MUTED,
                                       height=26, corner_radius=5, command=self._skip_end,
                                       state="disabled")
        self.skip_btn.pack(side="left", padx=4)
        self.speed_btn = ctk.CTkButton(build_row, text="1x", width=40, fg_color=PANEL2,
                                        hover_color="#173049", text_color=AMBER,
                                        height=26, corner_radius=5, command=self._cycle_speed,
                                        state="disabled")
        self.speed_btn.pack(side="left", padx=4)
        self.step_label = ctk.CTkLabel(build_row, text="", font=("Consolas", 10.5),
                                        text_color=MUTED)
        self.step_label.pack(side="left", padx=(10, 0))

        self.pseudo_label = ctk.CTkLabel(right, text="", font=("Consolas", 11),
                                          text_color=TRACE, justify="left", anchor="w")
        self.pseudo_label.grid(row=4, column=0, sticky="ew", padx=12, pady=(2, 6))

        actions = ctk.CTkFrame(right, fg_color="transparent")
        actions.grid(row=5, column=0, sticky="ew", padx=10, pady=(0, 12))
        self.save_btn = ctk.CTkButton(actions, text="\u2193 Save .circ file", fg_color=TRACE,
                                       text_color="#0B1826", hover_color="#57C9AE",
                                       font=("Consolas", 12, "bold"), command=self._save_circ,
                                       state="disabled")
        self.save_btn.pack(side="left", padx=(0, 8))
        self.status_label = ctk.CTkLabel(actions, text="", font=("Consolas", 10.5), text_color=MUTED)
        self.status_label.pack(side="left")

        body.add(left, minsize=340, width=700, stretch="always")
        body.add(right, minsize=340, width=700, stretch="always")

    # ---------------- chat helpers ----------------
    def _append_log(self, who, text):
        self.log.configure(state="normal")
        self.log.insert("end", f"{who}> {text}\n\n")
        self.log.configure(state="disabled")
        self.log.see("end")

    def _welcome(self):
        self._append_log("bot", "Hey -- I build live, clickable circuit simulations for "
                                 "CSCI-335, plus a Logisim file to match. Type what you need "
                                 "below.")

    def _on_send(self):
        text = self.entry.get().strip()
        if not text:
            return
        self.entry.delete(0, "end")
        self._append_log("you", text)

        key = None
        if USE_GEMINI:
            try:
                key = gemini_match(text)
            except Exception:
                key = None
        if key is None:
            key = local_match(text)

        if key:
            if concept_match(text):
                self._append_log("bot", f"{META[key]['title']}: {GATE_INFO[key]}")
            elif describe_match(text):
                steps = BUILD_STEPS[key]
                numbered = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(steps))
                self._append_log("bot", f"How to build a {META[key]['title']}:\n{numbered}")
            else:
                self._append_log("bot", f"matched: {META[key]['title']}")
            self._show_result(key, confidence="high" if not USE_GEMINI else "medium")
        else:
            options = ", ".join(META[k]["title"] for k in CHIP_LIST)
            self._append_log("bot", f"I couldn't match that to something in the library yet. "
                                     f"Available right now: {options}.")

    def _show_result(self, key, confidence="high"):
        self._stop_playing()
        self.canvas_frame.show_circuit(key)
        pseudocode = "\n".join(META[key]["pseudocode"])
        self.pseudo_label.configure(text=pseudocode)
        self.save_btn.configure(state="normal")
        self._current_key = key
        self.status_label.configure(text="")
        n = self.canvas_frame.stage_count()
        self._append_log("bot", f"Building it {n} steps -- every pin and gate gets its own "
                                 f"step, narrated below as it goes. Hit Pause any time to "
                                 f"slow down, or Skip to end to jump straight to the live "
                                 f"clickable circuit.")
        self._reveal_stage()
        self.playing = True
        self._update_build_ui()
        self.play_job = self.after(self.play_delay_ms, self._play_tick)

    # ---------------- build animation ----------------
    SPEEDS = [("1x", 900), ("2x", 450), ("4x", 220)]

    def _update_build_ui(self):
        n = self.canvas_frame.stage_count()
        if n == 0:
            self.stage_caption_label.configure(text="")
            self.step_label.configure(text="")
            for b in (self.prev_btn, self.play_btn, self.next_btn, self.skip_btn, self.speed_btn):
                b.configure(state="disabled")
            return
        idx = self.canvas_frame.stage_idx
        self.stage_caption_label.configure(text=self.canvas_frame.current_caption())
        self.step_label.configure(text=f"step {idx + 1} / {n}")
        self.prev_btn.configure(state="normal" if idx > 0 else "disabled")
        self.next_btn.configure(state="normal" if idx < n - 1 else "disabled")
        self.skip_btn.configure(state="normal" if idx < n - 1 else "disabled")
        self.speed_btn.configure(state="normal")
        self.play_btn.configure(state="normal", text="⏸ Pause" if self.playing else "▶ Play")

    def _cycle_speed(self):
        self._speed_idx = (getattr(self, "_speed_idx", 0) + 1) % len(self.SPEEDS)
        label, delay = self.SPEEDS[self._speed_idx]
        self.play_delay_ms = delay
        self.speed_btn.configure(text=label)

    def _stop_playing(self):
        self.playing = False
        if self.play_job is not None:
            self.after_cancel(self.play_job)
            self.play_job = None
        if self.flash_job is not None:
            self.after_cancel(self.flash_job)
            self.flash_job = None

    def _reveal_stage(self):
        """Pop the current stage in with a bright flash, settle it a beat
        later, and have the bot narrate what just got added into the chat
        log -- this is the one path used for every forward-moving reveal
        (auto-play ticks, manual Next, and the very first stage)."""
        if self.flash_job is not None:
            self.after_cancel(self.flash_job)
            self.flash_job = None
        self.canvas_frame.render(flash=True)
        caption = self.canvas_frame.current_caption()
        if caption:
            self._append_log("bot", caption)
        self.flash_job = self.after(140, self._settle_flash)

    def _settle_flash(self):
        self.flash_job = None
        self.canvas_frame.render(flash=False)

    def _toggle_play(self):
        if self.playing:
            self._stop_playing()
            self._update_build_ui()
            return
        if self.canvas_frame.is_final_stage():
            self.canvas_frame.reset_stage()
            self._reveal_stage()
        self.playing = True
        self._update_build_ui()
        self.play_job = self.after(self.play_delay_ms, self._play_tick)

    def _play_tick(self):
        if not self.playing:
            return
        advanced = self.canvas_frame.next_stage()
        if not advanced:
            self.playing = False
            self.play_job = None
            self._update_build_ui()
            return
        self._reveal_stage()
        self._update_build_ui()
        if self.canvas_frame.is_final_stage():
            self.playing = False
            self.play_job = None
            self._update_build_ui()
            self._append_log("bot", "Done -- fully wired. Click any input pin to toggle it "
                                     "and watch the values ripple through live.")
            return
        self.play_job = self.after(self.play_delay_ms, self._play_tick)

    def _step_next(self):
        self._stop_playing()
        if self.canvas_frame.next_stage():
            self._reveal_stage()
        self._update_build_ui()

    def _step_prev(self):
        self._stop_playing()
        self.canvas_frame.prev_stage()
        self._update_build_ui()

    def _skip_end(self):
        self._stop_playing()
        self.canvas_frame.goto_stage(self.canvas_frame.stage_count() - 1)
        self._update_build_ui()

    def _save_circ(self):
        key = getattr(self, "_current_key", None)
        if not key:
            return
        path = filedialog.asksaveasfilename(
            defaultextension=".circ",
            initialfile=f"{key}.circ",
            filetypes=[("Logisim circuit", "*.circ"), ("All files", "*.*")],
        )
        if not path:
            return
        with open(path, "w") as f:
            f.write(CIRC_XML[key])
        self.status_label.configure(text=f"saved to {path}")
        messagebox.showinfo("Saved", f"{META[key]['title']} saved to:\n{path}\n\n"
                                      "Open it in Logisim Evolution with File -> Open.")


if __name__ == "__main__":
    app = LogisimChatbotApp()
    app.mainloop()
