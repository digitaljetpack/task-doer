import os
import sys
import shutil
import traceback
from datetime import datetime
import tkinter as tk
from tkinter import ttk, messagebox

# ---------------------------
# Config knobs (tweak freely)
# ---------------------------
APP_TITLE = "Clipboard & Stash Explorer"
MAX_TEXT_BYTES_PER_FILE = 5 * 1024 * 1024  # 5 MB safety guard when reading as text
STASH_ROOT = "_stash"  # created under the current working directory
TEXT_ENCODING = "utf-8"
TEXT_ERRORS = "ignore"  # be permissive; skip undecodable bytes


def is_probably_text(path):
    """
    Heuristic: treat as text if extension is common text/code OR smallish file.
    You can expand this list as needed.
    """
    text_exts = {
        ".txt", ".md", ".py", ".js", ".ts", ".jsx", ".tsx", ".json", ".yml", ".yaml",
        ".xml", ".html", ".css", ".scss", ".sass", ".toml", ".ini", ".cfg", ".csv",
        ".tsv", ".env", ".sh", ".bat", ".ps1", ".c", ".h", ".hpp", ".hh", ".cpp",
        ".cc", ".rs", ".go", ".java", ".kt", ".rb", ".php", ".sql", ".swift", ".m",
        ".mm", ".r", ".lua", ".pl", ".tex", ".rst"
    }
    _, ext = os.path.splitext(path.lower())
    if ext in text_exts:
        return True
    try:
        return os.path.getsize(path) <= MAX_TEXT_BYTES_PER_FILE
    except Exception:
        return False


class ExplorerApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("1000x620")
        self.minsize(800, 480)

        self.cwd = os.getcwd()
        self.status_var = tk.StringVar(value=f"Ready • CWD: {self.cwd}")
        self.preview_var = tk.StringVar(value="Preview: (select a single file to show a snippet)")

        self._build_ui()
        self._populate_tree(self.cwd)

    # ---------- UI ----------
    def _build_ui(self):
        # Top controls
        toolbar = ttk.Frame(self, padding=(8, 8))
        toolbar.pack(side=tk.TOP, fill=tk.X)

        ttk.Label(toolbar, text=f"CWD: {self.cwd}").pack(side=tk.LEFT, padx=(0, 12))

        ttk.Button(toolbar, text="Refresh", command=self._refresh).pack(side=tk.LEFT, padx=4)
        ttk.Button(toolbar, text="Select All", command=self._select_all).pack(side=tk.LEFT, padx=4)
        ttk.Button(toolbar, text="Clear Selection", command=self._clear_selection).pack(side=tk.LEFT, padx=4)

        ttk.Separator(self, orient="horizontal").pack(fill=tk.X, pady=(2, 2))

        # Main split: explorer (left) and preview (right)
        main = ttk.PanedWindow(self, orient=tk.HORIZONTAL)
        main.pack(fill=tk.BOTH, expand=True)

        # Left: Tree (file explorer)
        left = ttk.Frame(main, padding=8)
        main.add(left, weight=3)

        columns = ("#fullpath", "#type", "#size")
        self.tree = ttk.Treeview(
            left, columns=columns, displaycolumns=("#type", "#size"),
            selectmode="extended"
        )
        self.tree.heading("#0", text="Name", anchor="w")
        self.tree.heading("#type", text="Type", anchor="w")
        self.tree.heading("#size", text="Size", anchor="e")

        self.tree.column("#0", stretch=True, width=420)
        self.tree.column("#type", width=120, anchor="w")
        self.tree.column("#size", width=100, anchor="e")

        ysb = ttk.Scrollbar(left, orient="vertical", command=self.tree.yview)
        xsb = ttk.Scrollbar(left, orient="horizontal", command=self.tree.xview)
        self.tree.configure(yscroll=ysb.set, xscroll=xsb.set)

        self.tree.grid(row=0, column=0, sticky="nsew")
        ysb.grid(row=0, column=1, sticky="ns")
        xsb.grid(row=1, column=0, sticky="ew")
        left.rowconfigure(0, weight=1)
        left.columnconfigure(0, weight=1)

        self.tree.bind("<<TreeviewOpen>>", self._on_open_node)
        self.tree.bind("<<TreeviewSelect>>", self._on_select_change)
        self.tree.bind("<Double-1>", self._on_double_click)

        # Right: Preview and actions
        right = ttk.Frame(main, padding=8)
        main.add(right, weight=2)

        self.preview_label = ttk.Label(right, textvariable=self.preview_var)
        self.preview_label.pack(anchor="w", pady=(0, 4))

        self.preview_text = tk.Text(right, wrap="none", height=10)
        self.preview_text.configure(state="disabled")
        self.preview_text.pack(fill=tk.BOTH, expand=True)

        # Action buttons
        actions = ttk.Frame(right)
        actions.pack(fill=tk.X, pady=(8, 0))
        ttk.Button(actions, text="Copy to Clipboard", command=self.copy_to_clipboard).pack(side=tk.LEFT, padx=4)
        ttk.Button(actions, text="Create Stash", command=self.create_stash).pack(side=tk.LEFT, padx=4)
        ttk.Button(actions, text="Open Stash Folder", command=self.open_stash_root).pack(side=tk.LEFT, padx=4)

        # Status bar
        status = ttk.Label(self, textvariable=self.status_var, anchor="w", relief="sunken")
        status.pack(side=tk.BOTTOM, fill=tk.X)

    # ---------- Tree population ----------
    def _populate_tree(self, root_path, parent_node=""):
        self.tree.delete(*self.tree.get_children(parent_node))
        try:
            entries = sorted(os.listdir(root_path), key=lambda p: (not os.path.isdir(os.path.join(root_path, p)), p.lower()))
        except Exception as e:
            messagebox.showerror("Error", f"Cannot list directory:\n{root_path}\n\n{e}")
            return

        for name in entries:
            full = os.path.join(root_path, name)
            is_dir = os.path.isdir(full)
            node = self.tree.insert(
                parent_node, tk.END, text=name,
                values=(full, "Folder" if is_dir else "File", self._format_size(full) if not is_dir else ""),
                open=False
            )
            # Add a dummy child so folders can be expanded lazily
            if is_dir:
                self.tree.insert(node, tk.END, text="(loading...)", values=("", "", ""))

    def _on_open_node(self, event):
        node = self.tree.focus()
        fullpath = self.tree.set(node, "#fullpath")
        # If it has a dummy child, repopulate
        children = self.tree.get_children(node)
        if children:
            first_child = children[0]
            if self.tree.item(first_child, "text") == "(loading...)":
                self.tree.delete(first_child)
                self._populate_tree(fullpath, node)

    def _on_double_click(self, event):
        node = self.tree.focus()
        fullpath = self.tree.set(node, "#fullpath")
        if os.path.isdir(fullpath):
            # Toggle expansion
            is_open = self.tree.item(node, "open")
            self.tree.item(node, open=not is_open)
        else:
            self._show_preview(fullpath)

    def _on_select_change(self, event=None):
        # If a single file is selected, show preview
        selected = self.tree.selection()
        if len(selected) == 1:
            fullpath = self.tree.set(selected[0], "#fullpath")
            if os.path.isfile(fullpath) and is_probably_text(fullpath):
                self._show_preview(fullpath)
            else:
                self._clear_preview()
        else:
            self._clear_preview()

    def _show_preview(self, path):
        try:
            if not is_probably_text(path):
                self.preview_var.set(f"Preview: {os.path.basename(path)} (skipped: not treated as text)")
                self._set_preview_text("(binary or large file — not previewed)")
                return
            with open(path, "r", encoding=TEXT_ENCODING, errors=TEXT_ERRORS) as f:
                snippet = f.read(50_000)
            self.preview_var.set(f"Preview: {os.path.basename(path)}")
            self._set_preview_text(snippet)
        except Exception as e:
            self.preview_var.set(f"Preview: {os.path.basename(path)} (error)")
            self._set_preview_text(f"Error reading file:\n{e}")

    def _clear_preview(self):
        self.preview_var.set("Preview: (select a single file to show a snippet)")
        self._set_preview_text("")

    def _set_preview_text(self, text):
        self.preview_text.configure(state="normal")
        self.preview_text.delete("1.0", tk.END)
        self.preview_text.insert("1.0", text)
        self.preview_text.configure(state="disabled")

    # ---------- Actions ----------
    def _refresh(self):
        self._populate_tree(self.cwd)
        self.status_var.set(f"Refreshed • CWD: {self.cwd}")

    def _select_all(self):
        # Select all top-level nodes (and thus their subtrees for folder inclusion logic)
        self.tree.selection_set(self.tree.get_children(""))
        self.status_var.set("Selected all items")

    def _clear_selection(self):
        self.tree.selection_remove(self.tree.selection())
        self.status_var.set("Selection cleared")
        self._clear_preview()

    def _gather_selected_files(self):
        """Return a sorted list of absolute file paths from selected nodes.
        If a folder is selected, include all files under it (recursively)."""
        paths = set()
        nodes = self.tree.selection()
        if not nodes:
            return []

        for node in nodes:
            full = self.tree.set(node, "#fullpath")
            if not full:
                continue
            if os.path.isdir(full):
                for root, _, files in os.walk(full):
                    for fn in files:
                        paths.add(os.path.join(root, fn))
            elif os.path.isfile(full):
                paths.add(full)

        return sorted(paths)

    def copy_to_clipboard(self):
        try:
            files = self._gather_selected_files()
            if not files:
                messagebox.showinfo("Nothing selected", "Select one or more files or folders first.")
                return

            manifest_lines = [f"# File manifest ({len(files)} files) generated {datetime.now().isoformat(timespec='seconds')}"]
            manifest_lines.extend(files)
            manifest = "\n".join(manifest_lines)

            pieces = [manifest, "\n\n# -------- Combined File Contents --------\n"]

            for fp in files:
                if not is_probably_text(fp):
                    pieces.append(f"\n# [SKIP: binary/large] {fp}\n")
                    continue
                try:
                    with open(fp, "r", encoding=TEXT_ENCODING, errors=TEXT_ERRORS) as f:
                        body = f.read()
                    header = f"\n# ===== BEGIN {fp} =====\n"
                    footer = f"\n# ===== END {fp} =====\n"
                    pieces.append(header + body + footer)
                except Exception as e:
                    pieces.append(f"\n# [ERROR reading {fp}] {e}\n")

            payload = "\n".join(pieces)

            # Clipboard: text only (portable). Contains the manifest and combined text.
            self.clipboard_clear()
            self.clipboard_append(payload)
            self.update()  # keep clipboard contents after window loses focus

            self.status_var.set(f"Copied {len(files)} files (text) to clipboard")
        except Exception as e:
            traceback.print_exc()
            messagebox.showerror("Clipboard Error", f"Failed to copy to clipboard:\n\n{e}")

    def create_stash(self):
        files = self._gather_selected_files()
        if not files:
            messagebox.showinfo("Nothing selected", "Select one or more files or folders first.")
            return

        try:
            ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            stash_dir = os.path.join(self.cwd, STASH_ROOT, ts)
            os.makedirs(stash_dir, exist_ok=True)

            # Copy files preserving relative paths (relative to CWD)
            copied = 0
            for fp in files:
                if not os.path.isfile(fp):
                    continue
                rel = os.path.relpath(fp, start=self.cwd)
                out_path = os.path.join(stash_dir, rel)
                os.makedirs(os.path.dirname(out_path), exist_ok=True)
                shutil.copy2(fp, out_path)
                copied += 1

            # Write manifest and combined text
            manifest_path = os.path.join(stash_dir, "manifest.txt")
            combined_path = os.path.join(stash_dir, "combined.txt")

            with open(manifest_path, "w", encoding=TEXT_ENCODING) as mf:
                mf.write(f"# Manifest for stash {ts}\n")
                for fp in files:
                    mf.write(fp + "\n")

            with open(combined_path, "w", encoding=TEXT_ENCODING) as cf:
                cf.write(f"# Combined file contents for stash {ts}\n")
                for fp in files:
                    if not is_probably_text(fp):
                        cf.write(f"\n# [SKIP: binary/large] {fp}\n")
                        continue
                    try:
                        with open(fp, "r", encoding=TEXT_ENCODING, errors=TEXT_ERRORS) as f:
                            body = f.read()
                        cf.write(f"\n# ===== BEGIN {fp} =====\n")
                        cf.write(body)
                        cf.write(f"\n# ===== END {fp} =====\n")
                    except Exception as e:
                        cf.write(f"\n# [ERROR reading {fp}] {e}\n")

            self.status_var.set(f"Stash created: {stash_dir} • {copied} files copied")
            messagebox.showinfo("Stash created", f"Saved copies + combined text here:\n{stash_dir}")
        except Exception as e:
            traceback.print_exc()
            messagebox.showerror("Stash Error", f"Failed to create stash:\n\n{e}")

    def open_stash_root(self):
        path = os.path.join(self.cwd, STASH_ROOT)
        if not os.path.isdir(path):
            os.makedirs(path, exist_ok=True)
        try:
            if sys.platform.startswith("win"):
                os.startfile(path)  # type: ignore[attr-defined]
            elif sys.platform == "darwin":
                os.system(f'open "{path}"')
            else:
                os.system(f'xdg-open "{path}"')
        except Exception as e:
            messagebox.showerror("Open Folder", f"Could not open folder:\n{path}\n\n{e}")

    # ---------- Utils ----------
    def _format_size(self, path):
        try:
            size = os.path.getsize(path)
        except Exception:
            return ""
        for unit in ("B", "KB", "MB", "GB", "TB"):
            if size < 1024:
                return f"{size:.0f} {unit}"
            size /= 1024.0
        return f"{size:.1f} PB"


if __name__ == "__main__":
    app = ExplorerApp()
    app.mainloop()
