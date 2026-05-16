from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DB_PATH = PROJECT_ROOT / "backend" / "app" / "data" / "smartfactory.sqlite3"


def main() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
        print(f"Removed {DB_PATH}")
    else:
        print(f"No demo DB found at {DB_PATH}")


if __name__ == "__main__":
    main()
