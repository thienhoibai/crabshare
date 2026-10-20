"""Kiểm tra và chia bộ ảnh hộp nuôi đã gán nhãn (định dạng YOLO) thành train / val / test.

Chia theo nhóm (mặc định: theo hộp) để ảnh của cùng một hộp không nằm ở cả train lẫn test.

    python ml/scripts/prepare_dataset.py <thư mục xuất từ Roboflow/Label Studio> --check-only
    python ml/scripts/prepare_dataset.py <thư mục xuất> --out ml/datasets/crab
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import random
import re
import shutil
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
CRAB_CLASS_ID = 0
SPLITS = ("train", "val", "test")

# <nguồn>_<YYYYMMDD>_<số hộp>_<stt>, ví dụ iot_20261012_B017_003.jpg.
# Roboflow đổi tên thành iot_20261012_B017_003_jpg.rf.<hash>.jpg nên NAME_PATTERN chỉ khớp phần đầu.
NAME_PATTERN = re.compile(r"^(?P<source>[a-z0-9]+)_(?P<date>\d{8})_(?P<box>[A-Za-z0-9-]+)_(?P<seq>\d+)")
CANONICAL_NAME = re.compile(
    r"^(?P<source>[a-z0-9]+)_(?P<date>\d{8})_(?P<box>[A-Za-z0-9-]+)_(?P<seq>\d+)\.(?:jpg|jpeg|png|bmp|webp)$",
    re.IGNORECASE,
)
COORD_EPS = 1e-4


@dataclass
class Sample:
    image: Path
    label: Path | None
    sha256: str
    boxes: int = 0
    errors: list[str] = field(default_factory=list)
    source: str | None = None
    date: str | None = None
    box: str | None = None

    def group_key(self, group_by: str) -> str:
        # Ảnh công khai (hộp NA) và ảnh sai tên không có số hộp: mỗi file một nhóm.
        if group_by == "none" or self.box in (None, "NA"):
            return f"file:{self.image.stem}"
        if group_by == "date":
            return f"{self.source}_{self.date}"
        # Cùng số hộp ở cùng một tập, kể cả khi một ảnh từ trại IoT và một ảnh nhóm tự chụp.
        return self.box


def find_label(image: Path) -> Path | None:
    candidates = [image.with_suffix(".txt")]
    if image.parent.name == "images":
        candidates.insert(0, image.parent.parent / "labels" / f"{image.stem}.txt")
    return next((c for c in candidates if c.is_file()), None)


def read_label(path: Path) -> tuple[int, list[str]]:
    boxes, errors = 0, []
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        parts = line.split()
        if not parts:
            continue
        if len(parts) != 5:
            errors.append(f"dòng {line_no}: cần 5 giá trị 'class cx cy w h', có {len(parts)}")
            continue
        try:
            class_id = int(parts[0])
            cx, cy, w, h = map(float, parts[1:])
        except ValueError:
            errors.append(f"dòng {line_no}: giá trị không phải số")
            continue
        if class_id != CRAB_CLASS_ID:
            errors.append(f"dòng {line_no}: class {class_id} (chỉ có 0 = crab)")
        if not box_inside(cx, cy, w, h):
            errors.append(f"dòng {line_no}: khung tràn khỏi ảnh hoặc toạ độ không nằm trong [0, 1]")
        boxes += 1
    return boxes, errors


def box_inside(cx: float, cy: float, w: float, h: float) -> bool:
    if min(cx, cy, w, h) < 0.0 or max(cx, cy, w, h) > 1.0 or w <= 0 or h <= 0:
        return False
    return (
        cx - w / 2 >= -COORD_EPS
        and cy - h / 2 >= -COORD_EPS
        and cx + w / 2 <= 1.0 + COORD_EPS
        and cy + h / 2 <= 1.0 + COORD_EPS
    )


def name_rank(path: Path) -> tuple:
    """Bản nên giữ khi trùng nội dung: có nhãn, đúng tên chuẩn, rồi mới tới đường dẫn."""
    return (
        0 if find_label(path) is not None else 1,
        0 if CANONICAL_NAME.match(path.name) else 1,
        0 if NAME_PATTERN.match(path.name) else 1,
        str(path),
    )


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def collect(source_dir: Path) -> tuple[list[Sample], list[Path], list[tuple[Path, Path]], list[Path]]:
    samples: list[Sample] = []
    unlabeled: list[Path] = []
    duplicates: list[tuple[Path, Path]] = []
    unnamed: list[Path] = []

    images = [p for p in source_dir.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS]
    by_hash: dict[str, list[Path]] = defaultdict(list)
    for image in images:
        by_hash[sha256_of(image)].append(image)

    for digest, paths in by_hash.items():
        paths.sort(key=name_rank)
        kept, *extra = paths
        for other in extra:
            duplicates.append((other, kept))

        label = find_label(kept)
        if label is None:
            unlabeled.append(kept)
            continue

        sample = Sample(image=kept, label=label, sha256=digest)
        sample.boxes, sample.errors = read_label(label)
        match = NAME_PATTERN.match(kept.name)
        if match:
            sample.source, sample.date, sample.box = match["source"], match["date"], match["box"]
        else:
            unnamed.append(kept)
        samples.append(sample)

    samples.sort(key=lambda s: str(s.image))
    unlabeled.sort()
    unnamed.sort()
    duplicates.sort(key=lambda pair: str(pair[0]))
    return samples, unlabeled, duplicates, unnamed


def output_name_clashes(samples: list[Sample]) -> list[str]:
    """Hai ảnh khác nội dung nhưng cùng tên file (hoặc cùng tên file nhãn) sẽ đè lên nhau khi ghi."""
    by_name: dict[str, list[Path]] = defaultdict(list)
    by_stem: dict[str, list[Path]] = defaultdict(list)
    for sample in samples:
        by_name[sample.image.name].append(sample.image)
        by_stem[sample.image.stem].append(sample.image)

    clashes: list[str] = []
    for name, paths in sorted(by_name.items()):
        if len(paths) > 1:
            clashes.append(f"{name}: " + " | ".join(str(p) for p in paths))
    for stem, paths in sorted(by_stem.items()):
        names = {p.name for p in paths}
        if len(names) > 1:
            clashes.append(f"cùng file nhãn {stem}.txt: " + " | ".join(str(p) for p in paths))
    return clashes


def split_groups(samples: list[Sample], group_by: str, ratios: tuple[float, float, float], seed: int) -> dict[str, str]:
    groups: dict[str, list[Sample]] = defaultdict(list)
    for s in samples:
        groups[s.group_key(group_by)].append(s)
    if len(groups) < len(SPLITS):
        raise SystemExit(f"Chỉ có {len(groups)} nhóm, cần ít nhất {len(SPLITS)} để chia train/val/test.")

    keys = list(groups)
    random.Random(seed).shuffle(keys)
    keys.sort(key=lambda k: len(groups[k]))

    total = len(samples)
    targets = {name: ratio * total for name, ratio in zip(SPLITS, ratios)}
    counts = {name: 0 for name in SPLITS}
    assignment: dict[str, str] = {}

    # Mỗi tập nhận một nhóm nhỏ trước, để val/test không bị khoá bởi hộp có nhiều ảnh.
    # Nhóm lớn còn lại đổ vào tập còn thiếu nhiều nhất.
    split_order = sorted(SPLITS, key=lambda n: targets[n], reverse=True)
    for key, name in zip(keys, split_order):
        assignment[key] = name
        counts[name] += len(groups[key])
    remaining = keys[len(SPLITS):]
    remaining.sort(key=lambda k: len(groups[k]), reverse=True)
    for key in remaining:
        name = max(SPLITS, key=lambda n: (targets[n] - counts[n], -SPLITS.index(n)))
        assignment[key] = name
        counts[name] += len(groups[key])
    return assignment


def write_dataset(samples: list[Sample], assignment: dict[str, str], group_by: str, out_dir: Path, overwrite: bool) -> None:
    clashes = output_name_clashes(samples)
    if clashes:
        raise SystemExit("Trùng tên file đầu ra, không ghi đè:\n" + "\n".join(clashes))

    for sub in ("images", "labels"):
        target = out_dir / sub
        if target.exists() and any(target.rglob("*")):
            if not overwrite:
                raise SystemExit(f"{target} đã có dữ liệu. Thêm --overwrite để ghi đè.")
            shutil.rmtree(target)
    for name in SPLITS:
        (out_dir / "images" / name).mkdir(parents=True, exist_ok=True)
        (out_dir / "labels" / name).mkdir(parents=True, exist_ok=True)

    with (out_dir / "split_manifest.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["file", "split", "group", "boxes", "sha256", "source_path"])
        for s in samples:
            split = assignment[s.group_key(group_by)]
            shutil.copy2(s.image, out_dir / "images" / split / s.image.name)
            shutil.copy2(s.label, out_dir / "labels" / split / f"{s.image.stem}.txt")
            writer.writerow([s.image.name, split, s.group_key(group_by), s.boxes, s.sha256, str(s.image)])

    # data.yaml cạnh ảnh để Colab/train trỏ thẳng vào out_dir (path: .)
    (out_dir / "data.yaml").write_text(
        "\n".join(
            [
                "# Sinh bởi prepare_dataset.py — path tương đối thư mục này",
                "path: .",
                "train: images/train",
                "val: images/val",
                "test: images/test",
                "",
                "names:",
                "  0: crab",
                "",
            ]
        ),
        encoding="utf-8",
    )


def print_report(samples, unlabeled, duplicates, unnamed, assignment=None, group_by="box") -> bool:
    positives = sum(1 for s in samples if s.boxes > 0)
    negatives = len(samples) - positives
    invalid = [s for s in samples if s.errors]

    print(f"Ảnh đã gán nhãn: {len(samples)}  (có cua: {positives}, không cua: {negatives})")
    if samples:
        print(f"Tỷ lệ ảnh không cua: {negatives / len(samples):.0%}  (mục tiêu 30–40%)")
    print(f"Tổng số khung cua: {sum(s.boxes for s in samples)}")

    for title, items in (
        ("Ảnh chưa có file nhãn (bị bỏ qua — chưa gán nhãn khác với 'không có cua')", unlabeled),
        ("Ảnh sai quy ước tên (mỗi ảnh thành một nhóm riêng, dễ rò rỉ giữa các tập)", unnamed),
    ):
        if items:
            print(f"\n{title}: {len(items)}")
            for p in items[:10]:
                print(f"  - {p}")
    if duplicates:
        print(f"\nẢnh trùng nội dung (giữ bản đầu): {len(duplicates)}")
        for dup, original in duplicates[:10]:
            print(f"  - {dup}  ==  {original}")
    if invalid:
        print(f"\nFile nhãn lỗi: {len(invalid)}")
        for s in invalid[:10]:
            print(f"  - {s.label}: {'; '.join(s.errors)}")

    if assignment:
        print(f"\nChia theo: {group_by}")
        for name in SPLITS:
            members = [s for s in samples if assignment[s.group_key(group_by)] == name]
            pos = sum(1 for s in members if s.boxes > 0)
            groups = {s.group_key(group_by) for s in members}
            print(f"  {name:5}: {len(members):4} ảnh, {len(groups):3} nhóm, có cua {pos}, không cua {len(members) - pos}")

    return not invalid and not unnamed


def parse_ratios(text: str) -> tuple[float, float, float]:
    values = [float(v) for v in text.split("/")]
    if len(values) != 3 or any(v <= 0 for v in values):
        raise argparse.ArgumentTypeError("dạng 70/15/15")
    total = sum(values)
    return tuple(v / total for v in values)  # type: ignore[return-value]


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=Path, help="thư mục xuất YOLO từ công cụ gán nhãn")
    parser.add_argument("--out", type=Path, default=Path("ml/datasets/crab"))
    parser.add_argument("--group-by", choices=("box", "date", "none"), default="box")
    parser.add_argument("--ratios", type=parse_ratios, default=(0.70, 0.15, 0.15))
    parser.add_argument("--seed", type=int, default=13)
    parser.add_argument("--check-only", action="store_true", help="chỉ kiểm tra, không chia")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    if not args.source.is_dir():
        parser.error(f"không thấy thư mục {args.source}")

    samples, unlabeled, duplicates, unnamed = collect(args.source)
    if not samples:
        print("Không tìm thấy ảnh nào có file nhãn.")
        return 1

    clashes = output_name_clashes(samples)
    ok = print_report(samples, unlabeled, duplicates, unnamed)
    if clashes:
        print(f"\nTrùng tên file đầu ra: {len(clashes)}")
        for line in clashes[:10]:
            print(f"  - {line}")
        ok = False

    if args.check_only:
        return 0 if ok else 1

    if not ok:
        print("\nSửa ảnh sai tên, file nhãn lỗi hoặc tên file trùng trước khi chia.")
        return 1

    assignment = split_groups(samples, args.group_by, args.ratios, args.seed)
    write_dataset(samples, assignment, args.group_by, args.out, args.overwrite)
    print_report(samples, unlabeled, duplicates, unnamed, assignment, args.group_by)
    print(f"\nĐã ghi vào {args.out} (kèm split_manifest.csv).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
