import re

files = [
    "src/app/page.tsx",
    "src/app/(auth)/login/page.tsx",
    "src/app/(dashboard)/layout.tsx",
    "src/app/(dashboard)/admin/branding/page.tsx",
    "src/app/(dashboard)/admin/case-codes/page.tsx",
    "src/app/(dashboard)/admin/integrations/page.tsx",
    "src/app/(dashboard)/admin/notifications/page.tsx",
    "src/app/(dashboard)/admin/page.tsx",
    "src/app/(dashboard)/admin/units/page.tsx",
    "src/app/(dashboard)/admin/users/page.tsx",
    "src/app/(dashboard)/agent-workspace/page.tsx",
    "src/app/(dashboard)/analytics/page.tsx",
    "src/app/(dashboard)/cases/[id]/page.tsx",
    "src/app/(dashboard)/cases/new/page.tsx",
    "src/app/(dashboard)/cases/page.tsx",
    "src/app/(dashboard)/customers/[id]/accounts/[productId]/page.tsx",
    "src/app/(dashboard)/customers/[id]/page.tsx",
    "src/app/(dashboard)/customers/page.tsx",
    "src/app/(dashboard)/dashboard/page.tsx",
    "src/app/(dashboard)/inbox/page.tsx",
    "src/app/(dashboard)/knowledge/page.tsx",
    "src/app/(dashboard)/performance/page.tsx",
    "src/app/(dashboard)/team/page.tsx",
    "src/app/(dashboard)/workflows/page.tsx",
    "src/app/cases/[id]/print/page.tsx",
]

MARKER = 'export const dynamic = "force-dynamic";'

for f in files:
    try:
        content = open(f).read()
    except FileNotFoundError:
        print(f"NOT FOUND (skipping): {f}")
        continue
    if MARKER in content:
        print(f"already present, skipping: {f}")
        continue
    lines = content.split("\n")
    last_import_idx = -1
    for i, line in enumerate(lines):
        if line.startswith("import "):
            last_import_idx = i
    if last_import_idx == -1:
        print(f"WARNING no import line found: {f}")
        continue
    insertion = ["", MARKER]
    lines = lines[:last_import_idx+1] + insertion + lines[last_import_idx+1:]
    open(f, "w").write("\n".join(lines))
    print(f"updated: {f}")
