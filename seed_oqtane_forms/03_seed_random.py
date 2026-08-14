#!/usr/bin/env python3
"""
Seed dữ liệu ngẫu nhiên cho Form 3 (Down Under) và Form 4 (Form co CV).

Cách dùng:
  # Chạy thử ~20 bản ghi mỗi form, KHÔNG ghi MF_Submissions
  python 03_seed_random.py --test

  # Seed đầy đủ 500.000 bản ghi mỗi form
  python 03_seed_random.py --full

  # Kèm ghi MF_Submissions (chậm hơn)
  python 03_seed_random.py --full --with-submissions

Mặc định kết nối SQL Express local bằng Windows Authentication.
"""
import argparse
import json
import random
import sys
import time
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Iterable, List, Tuple

import pyodbc

# ─────────────────────────── Config ───────────────────────────
CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\SQLEXPRESS;"
    "DATABASE=Oqtane_MegaForm_Fresh1799;"
    "Trusted_Connection=yes;"
)

FORM_TABLES = {
    4: "Form_CV_Submissions",
    3: "Form_DownUnder_Submissions",
}

# Các tùy chọn đúng theo schema của form 3
DOWNUNDER_OPTIONS = {
    "nationality": ["United Kingdom", "United States", "Canada", "Germany", "France", "Australia", "New Zealand", "Japan", "Vietnam", "Singapore"],
    "purpose": ["work", "study", "travel", "volunteer", "business"],
    "region": ["sydney", "melbourne", "goldcoast", "cairns", "uluru"],
    "interests": ["beaches", "wildlife", "hiking", "food_wine", "diving", "surfing", "music", "art"],
    "duration": ["w1_2", "m1", "m3", "m6", "y1"],
    "stay": ["hostel", "hotel", "airbnb", "homestay", "campervan"],
    "budget": ["budget", "mid", "premium"],
}

FIRST_NAMES = [
    "Nguyen", "Tran", "Le", "Pham", "Hoang", "Vu", "Dang", "Bui", "Do", "Ho",
    "John", "Jane", "Michael", "Sarah", "David", "Emily", "Robert", "Emma",
    "James", "Olivia", "William", "Sophia", "Daniel", "Isabella", "Liam", "Mia"
]
LAST_NAMES = [
    "Van A", "Thi B", "Minh C", "Hoang D", "Tuan E", "Lan F", "Duc G", "Hanh H",
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Wilson", "Martinez", "Anderson", "Taylor", "Thomas", "Jackson", "White", "Harris"
]
DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "example.com", "company.com", "mail.vn"]

DROPDOWN_OPTIONS = ["option_1", "option_2", "option_3"]


# ─────────────────────────── Helpers ───────────────────────────
def random_name() -> Tuple[str, str]:
    first = random.choice(FIRST_NAMES)
    last = random.choice(LAST_NAMES)
    return first, last


def random_email(first: str, last: str) -> str:
    base = f"{first.lower()}.{last.lower().replace(' ', '.')}"
    base = "".join(c for c in base if c.isalnum() or c in ".-_")
    return f"{base}{random.randint(1, 9999)}@{random.choice(DOMAINS)}"


def random_phone() -> str:
    return f"+{random.choice(['1', '44', '61', '84', '49'])}{random.randint(100000000, 999999999)}"


def random_date(start: date, end: date) -> date:
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))


def random_sentence(min_words: int = 3, max_words: int = 12) -> str:
    words = ["lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
             "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
             "magna", "aliqua", "ut", "enim", "ad", "minim", "veniam", "quis", "nostrud",
             "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
             "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate", "velit",
             "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint", "occaecat",
             "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia", "deserunt",
             "mollit", "anim", "id", "est", "laborum"]
    n = random.randint(min_words, max_words)
    return " ".join(random.choice(words) for _ in range(n)).capitalize() + "."


def random_file_json() -> str:
    ext = random.choice(["pdf", "jpg", "png", "docx"])
    name = f"file_{random.randint(1000, 9999)}.{ext}"
    return json.dumps({"name": name, "size": random.randint(10000, 9000000), "type": ext})


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def build_datajson_form4(row: dict) -> dict:
    return {
        "full_name": row["FullName"],
        "short_text": row["ShortText"],
        "dropdown": row["Dropdown"],
        "number": row["Number"],
        "file_upload": row["FileUpload"] or "",
        "date": row["DateValue"].isoformat() if row["DateValue"] else ""
    }


def build_datajson_form3(row: dict) -> dict:
    return {
        "first_name": row["FirstName"],
        "last_name": row["LastName"],
        "email": row["Email"],
        "phone": row["Phone"],
        "dob": row["DOB"].isoformat() if row["DOB"] else "",
        "nationality": row["Nationality"],
        "purpose": row["Purpose"],
        "region": row["Region"],
        "interests": row["Interests"],
        "duration": row["Duration"],
        "stay": row["Stay"],
        "budget": row["Budget"],
        "arrival": row["Arrival"].isoformat() if row["Arrival"] else "",
        "notes": row["Notes"] or "",
        "terms": "yes" if row["Terms"] else ""
    }


# ─────────────────────────── Generators ───────────────────────────
def generate_form4_row() -> dict:
    first, last = random_name()
    return {
        "SubmissionId": None,
        "FullName": f"{first} {last}",
        "ShortText": random_sentence(),
        "Dropdown": random.choice(DROPDOWN_OPTIONS),
        "Number": str(random.randint(0, 99999)),
        "FileUpload": random_file_json() if random.random() < 0.5 else None,
        "DateValue": random_date(date.today() - timedelta(days=730), date.today()),
        "SubmittedOnUtc": utc_now(),
    }


def generate_form3_row() -> dict:
    first, last = random_name()
    interests = ",".join(random.sample(DOWNUNDER_OPTIONS["interests"], k=random.randint(1, 4)))
    return {
        "SubmissionId": None,
        "FirstName": first,
        "LastName": last,
        "Email": random_email(first, last),
        "Phone": random_phone(),
        "DOB": random_date(date.today() - timedelta(days=365 * 65), date.today() - timedelta(days=365 * 18)),
        "Nationality": random.choice(DOWNUNDER_OPTIONS["nationality"]),
        "Purpose": random.choice(DOWNUNDER_OPTIONS["purpose"]),
        "Region": random.choice(DOWNUNDER_OPTIONS["region"]),
        "Interests": interests,
        "Duration": random.choice(DOWNUNDER_OPTIONS["duration"]),
        "Stay": random.choice(DOWNUNDER_OPTIONS["stay"]),
        "Budget": random.choice(DOWNUNDER_OPTIONS["budget"]),
        "Arrival": random_date(date.today(), date.today() + timedelta(days=365)),
        "Notes": random_sentence() if random.random() < 0.7 else None,
        "Terms": True,
        "SubmittedOnUtc": utc_now(),
    }


# ─────────────────────────── Inserters ───────────────────────────
def prepare_values(rows: List[dict]) -> List[tuple]:
    if not rows:
        return []
    cols = list(rows[0].keys())
    return [tuple(r[c] for c in cols) for r in rows], cols


def bulk_insert_custom(conn, table: str, rows: List[dict], batch_size: int = 5000):
    if not rows:
        return
    cols = list(rows[0].keys())
    placeholders = ", ".join(["?"] * len(cols))
    col_list = ", ".join(f"[{c}]" for c in cols)
    sql = f"INSERT INTO [dbo].[{table}] ({col_list}) VALUES ({placeholders})"
    values = [tuple(r[c] for c in cols) for r in rows]
    cur = conn.cursor()
    total = len(values)
    for i in range(0, total, batch_size):
        batch = values[i:i + batch_size]
        cur.fast_executemany = True
        cur.executemany(sql, batch)
        conn.commit()
        print(f"  -> inserted {min(i + batch_size, total):,}/{total:,} into {table}")
    cur.close()


def bulk_insert_submissions(conn, form_id: int, rows: List[dict], builder, batch_size: int = 2000):
    """Bulk insert MF_Submissions rows ( SubmissionId để NULL trong bảng custom)."""
    if not rows:
        return
    sql = (
        "INSERT INTO [dbo].[MF_Submissions] "
        "([FormId],[DataJson],[IpAddress],[UserAgent],[UserId],[Status],[IsSpam],[SpamScore],[SubmittedOnUtc]) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    values = []
    for r in rows:
        data = builder(r)
        values.append((
            form_id,
            json.dumps(data, ensure_ascii=False),
            f"192.168.{random.randint(0,255)}.{random.randint(0,255)}",
            "seed-script/1.0",
            -1,
            "completed",
            False,
            0.0,
            r["SubmittedOnUtc"],
        ))
    cur = conn.cursor()
    total = len(values)
    for i in range(0, total, batch_size):
        batch = values[i:i + batch_size]
        cur.fast_executemany = True
        cur.executemany(sql, batch)
        conn.commit()
        print(f"  -> inserted {min(i + batch_size, total):,}/{total:,} into MF_Submissions (Form {form_id})")
    cur.close()


def seed_form(conn, form_id: int, count: int, with_submissions: bool, batch_size: int = 5000):
    print(f"\n[Form {form_id}] Seeding {count:,} rows...")
    table = FORM_TABLES[form_id]
    generator = generate_form4_row if form_id == 4 else generate_form3_row
    builder = build_datajson_form4 if form_id == 4 else build_datajson_form3

    start = time.time()
    total_inserted = 0
    buffer = []

    def flush_buffer():
        nonlocal buffer, total_inserted
        if not buffer:
            return
        if with_submissions:
            bulk_insert_submissions(conn, form_id, buffer, builder, batch_size=batch_size)
        bulk_insert_custom(conn, table, buffer, batch_size=batch_size)
        total_inserted += len(buffer)
        buffer = []

    for _ in range(count):
        buffer.append(generator())
        if len(buffer) >= batch_size:
            flush_buffer()
    flush_buffer()

    elapsed = time.time() - start
    print(f"[Form {form_id}] DONE in {elapsed:.2f}s ({total_inserted / elapsed:,.0f} rows/s)")


def verify_counts(conn):
    print("\n--- Verification ---")
    cur = conn.cursor()
    for form_id, table in FORM_TABLES.items():
        cur.execute(f"SELECT COUNT(*) FROM [dbo].[{table}]")
        custom = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM [dbo].[MF_Submissions] WHERE FormId = ?", (form_id,))
        subs = cur.fetchone()[0]
        print(f"  Form {form_id}: {table} = {custom:,} | MF_Submissions = {subs:,}")
    cur.close()


def main():
    parser = argparse.ArgumentParser(description="Seed random MegaForm submissions")
    parser.add_argument("--test", action="store_true", help="Chạy thử 20 bản ghi mỗi form")
    parser.add_argument("--full", action="store_true", help="Seed 500.000 bản ghi mỗi form")
    parser.add_argument("--with-submissions", action="store_true", help="Ghi kèm MF_Submissions (chậm hơn)")
    parser.add_argument("--batch-size", type=int, default=5000, help="Kích thước batch insert (mặc định 5000)")
    args = parser.parse_args()

    if not (args.test or args.full):
        print("Vui lòng chọn --test hoặc --full")
        sys.exit(1)

    count = 20 if args.test else 500_000
    print(f"Mode: {'TEST' if args.test else 'FULL'} | records per form: {count:,} | with_submissions={args.with_submissions} | batch_size={args.batch_size}")

    conn = pyodbc.connect(CONN_STR)
    try:
        for form_id in sorted(FORM_TABLES.keys()):
            seed_form(conn, form_id, count, args.with_submissions, batch_size=args.batch_size)
        verify_counts(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
