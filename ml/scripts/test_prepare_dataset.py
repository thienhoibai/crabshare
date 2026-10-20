"""Kiểm tra chia nhóm theo hộp và kiểm tra nhãn của prepare_dataset."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prepare_dataset as pd


def write_pair(folder: Path, name: str, payload: bytes, label: str | None) -> None:
    image = folder / "images" / name
    image.parent.mkdir(parents=True, exist_ok=True)
    image.write_bytes(payload)
    if label is not None:
        label_path = folder / "labels" / f"{Path(name).stem}.txt"
        label_path.parent.mkdir(parents=True, exist_ok=True)
        label_path.write_text(label, encoding="utf-8")


def fake(box: str, index: int, source: str = "self") -> pd.Sample:
    sample = pd.Sample(
        image=Path(f"{source}_20261012_{box}_{index:03d}.jpg"),
        label=None,
        sha256=f"{source}-{box}-{index}",
    )
    sample.source, sample.date, sample.box = source, "20261012", box
    sample.boxes = 1
    return sample


class PrepareDatasetTests(unittest.TestCase):
    def test_same_box_from_two_sources_stays_together(self) -> None:
        samples = [fake("B017", i, "iot") for i in range(4)]
        samples += [fake("B017", i, "self") for i in range(4)]
        samples += [fake(f"C{i:02d}", 0) for i in range(6)]
        assignment = pd.split_groups(samples, "box", (0.70, 0.15, 0.15), seed=13)
        splits = {assignment[s.group_key("box")] for s in samples if s.box == "B017"}
        self.assertEqual(splits, {"train"})

    def test_large_boxes_are_not_locked_into_val_and_test(self) -> None:
        samples = [fake("BIG", i) for i in range(40)]
        samples += [fake("MID", i) for i in range(25)]
        samples += [fake("M2", i) for i in range(20)]
        samples += [fake(f"S{i:02d}", j) for i in range(12) for j in range(2)]
        assignment = pd.split_groups(samples, "box", (0.70, 0.15, 0.15), seed=13)
        counts = {name: 0 for name in pd.SPLITS}
        groups = {name: set() for name in pd.SPLITS}
        for sample in samples:
            split = assignment[sample.group_key("box")]
            counts[split] += 1
            groups[split].add(sample.box)
        self.assertGreater(counts["train"], counts["val"])
        self.assertGreater(counts["train"], counts["test"])
        self.assertIn("BIG", groups["train"])
        self.assertGreater(len(groups["test"]), 1)
        self.assertLess(counts["val"], 25)

    def test_out_of_frame_box_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_pair(root / "train", "self_20261016_E01_001.jpg", b"e01", "0 0.10 0.50 0.50 0.20\n")
            write_pair(root / "train", "self_20261016_E02_001.jpg", b"e02", "0 0.50 0.50 0.20 0.20\n")
            write_pair(root / "train", "self_20261016_E03_001.jpg", b"e03", "")
            samples, _, _, _ = pd.collect(root)
            broken = next(s for s in samples if s.box == "E01")
            self.assertTrue(broken.errors)
            self.assertFalse(any(s.errors for s in samples if s.box != "E01"))

    def test_duplicate_bytes_keep_the_labeled_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            payload = b"same-crab"
            write_pair(root / "originals", "iot_20261012_B017_000.jpg", payload, None)
            write_pair(
                root / "export" / "train",
                "iot_20261012_B017_000_jpg.rf.abc123.jpg",
                payload,
                "0 0.50 0.50 0.20 0.20\n",
            )
            samples, unlabeled, duplicates, _ = pd.collect(root)
            self.assertEqual(len(samples), 1)
            self.assertIn(".rf.", samples[0].image.name)
            self.assertEqual(unlabeled, [])
            self.assertEqual(len(duplicates), 1)

    def test_duplicate_filenames_are_reported_and_not_written(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_pair(root / "train", "self_20261016_D01_001.jpg", b"d01-a", "0 0.50 0.50 0.20 0.20\n")
            write_pair(root / "valid", "self_20261016_D01_001.jpg", b"d01-b", "")
            write_pair(root / "train", "self_20261016_D02_001.jpg", b"d02", "")
            write_pair(root / "train", "self_20261016_D03_001.jpg", b"d03", "")
            samples, _, _, _ = pd.collect(root)
            self.assertTrue(pd.output_name_clashes(samples))
            out = root / "out"
            with self.assertRaises(SystemExit):
                pd.write_dataset(samples, {s.group_key("box"): "train" for s in samples}, "box", out, True)
            self.assertFalse(out.exists())

    def test_bad_name_fails_the_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_pair(root / "train", "IMG_1234.jpg", b"bad", "0 0.50 0.50 0.10 0.10\n")
            write_pair(root / "train", "self_20261016_F01_001.jpg", b"ok", "")
            samples, unlabeled, duplicates, unnamed = pd.collect(root)
            self.assertFalse(pd.print_report(samples, unlabeled, duplicates, unnamed))


if __name__ == "__main__":
    unittest.main()
