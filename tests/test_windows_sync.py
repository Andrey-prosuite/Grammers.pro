"""Run with python -m unittest discover -s tests; requires pwsh or powershell."""

from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


POWERSHELL = shutil.which("pwsh") or shutil.which("powershell")
SCRIPT = Path(__file__).resolve().parents[1] / "tools/sync-from-github.ps1"


@unittest.skipUnless(POWERSHELL, "PowerShell is required")
class SyncTests(unittest.TestCase):
    def git(self, directory, *args):
        return subprocess.check_output(
            ["git", "-C", str(directory), *args], stderr=subprocess.PIPE, text=True
        ).strip()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="grammers sync ")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.remote = self.root / "origin.git"
        self.writer = self.root / "writer"
        self.reader = self.root / "local clone"
        self.git(self.root, "init", "--bare", "--initial-branch=main", str(self.remote))
        self.git(self.root, "init", "--initial-branch=main", str(self.writer))
        self.configure(self.writer)
        (self.writer / "tools").mkdir()
        shutil.copyfile(SCRIPT, self.writer / "tools/sync-from-github.ps1")
        (self.writer / ".gitignore").write_text("ignored.txt\n")
        (self.writer / "page.txt").write_text("base")
        self.git(self.writer, "add", ".")
        self.git(self.writer, "commit", "-m", "base")
        self.git(self.writer, "remote", "add", "origin", str(self.remote))
        self.git(self.writer, "push", "-u", "origin", "main")
        self.git(self.root, "clone", str(self.remote), str(self.reader))
        self.configure(self.reader)
        self.before = self.git(self.reader, "rev-parse", "HEAD")

    def configure(self, repo):
        self.git(repo, "config", "user.name", "Sync Test")
        self.git(repo, "config", "user.email", "sync-test@example.invalid")
        self.git(repo, "config", "commit.gpgsign", "false")

    def publish(self, filename="page.txt", content="remote update", force_add=False):
        (self.writer / filename).write_text(content)
        self.git(self.writer, "add", *(["-f"] if force_add else []), filename)
        self.git(self.writer, "commit", "-m", "remote update")
        self.git(self.writer, "push", "origin", "main")
        return self.git(self.writer, "rev-parse", "HEAD")

    def sync(self):
        return subprocess.run(
            [POWERSHELL, "-NoProfile", "-NonInteractive", "-File",
             str(self.reader / "tools/sync-from-github.ps1"), "-Once"],
            capture_output=True, text=True, timeout=30,
        )

    def assert_head_unchanged(self):
        self.assertEqual(self.git(self.reader, "rev-parse", "HEAD"), self.before)

    def test_up_to_date(self):
        result = self.sync()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Up to date", result.stdout)
        self.assert_head_unchanged()

    def test_fast_forward(self):
        head = self.publish()
        result = self.sync()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Updated to", result.stdout)
        self.assertEqual(self.git(self.reader, "rev-parse", "HEAD"), head)
        self.assertEqual((self.reader / "page.txt").read_text(), "remote update")

    def test_local_edit_is_preserved(self):
        self.publish()
        (self.reader / "page.txt").write_text("my local edit")
        result = self.sync()
        self.assertIn("Paused: local changes", result.stdout)
        self.assert_head_unchanged()
        self.assertEqual((self.reader / "page.txt").read_text(), "my local edit")

    def test_untracked_file_is_preserved(self):
        self.publish("new.txt")
        (self.reader / "new.txt").write_text("my untracked file")
        result = self.sync()
        self.assertIn("Paused: local changes", result.stdout)
        self.assert_head_unchanged()
        self.assertEqual((self.reader / "new.txt").read_text(), "my untracked file")

    def test_local_commit_is_preserved(self):
        (self.reader / "local.txt").write_text("my commit")
        self.git(self.reader, "add", ".")
        self.git(self.reader, "commit", "-m", "local")
        self.before = self.git(self.reader, "rev-parse", "HEAD")
        result = self.sync()
        self.assertIn("Paused: local commits", result.stdout)
        self.assert_head_unchanged()

    def test_divergent_history_is_preserved(self):
        (self.reader / "local.txt").write_text("my commit")
        self.git(self.reader, "add", ".")
        self.git(self.reader, "commit", "-m", "local")
        self.before = self.git(self.reader, "rev-parse", "HEAD")
        self.publish()
        result = self.sync()
        self.assertIn("Paused: local commits", result.stdout)
        self.assert_head_unchanged()

    def test_other_branch_is_preserved(self):
        self.publish()
        self.git(self.reader, "switch", "-c", "my-work")
        result = self.sync()
        self.assertIn("switch to main", result.stdout)
        self.assertEqual(self.git(self.reader, "branch", "--show-current"), "my-work")
        self.assert_head_unchanged()

    def test_ignored_file_collision_is_preserved(self):
        self.publish("ignored.txt", force_add=True)
        (self.reader / "ignored.txt").write_text("my ignored file")
        result = self.sync()
        self.assertEqual(result.returncode, 1)
        self.assertIn("Update skipped. Review repository status", result.stdout)
        self.assert_head_unchanged()
        self.assertEqual((self.reader / "ignored.txt").read_text(), "my ignored file")

    def test_failed_fetch_does_not_modify_files(self):
        self.git(self.reader, "remote", "set-url", "origin", str(self.root / "missing.git"))
        result = self.sync()
        self.assertEqual(result.returncode, 1)
        self.assertIn("Fetch failed", result.stdout)
        self.assert_head_unchanged()
        self.assertEqual((self.reader / "page.txt").read_text(), "base")


if __name__ == "__main__":
    unittest.main()
