# Seed diverse Document Exchange submissions so the Gmail sidebar filters
# have variety to filter against: 5 owners, 4 departments, 3 directions,
# 5 document types, dates spread across overdue / due-soon / today / future.

$ErrorActionPreference = 'Stop'
$ConnStr = 'Server=.\SQLEXPRESS;Database=Oqtane_MSSQL;Trusted_Connection=True;Encrypt=False'
$FormId = 7
Add-Type -AssemblyName 'System.Data'

$today = (Get-Date).Date

$owners = @(
  @{ Name='Sarah Tran';     Email='sarah.tran@acme.com' },
  @{ Name='Marcus Chen';    Email='marcus.chen@acme.com' },
  @{ Name='Diana Pham';     Email='diana.pham@acme.com' },
  @{ Name='Liam OBrien';    Email='liam.obrien@acme.com' },
  @{ Name='Priya Singh';    Email='priya.singh@acme.com' },
  @{ Name='Hugo Martinez';  Email='hugo.martinez@acme.com' }
)
$departments = @('Finance','Human Resources','Corporate Affairs','Procurement')
$directions  = @('Incoming','Outgoing','Internal')
$docTypes    = @('Official Letter','Circular','Meeting Minutes','Decision Notice','Contract Annex')
$sources     = @('VietBank Hanoi','VNPT Group','Ministry of Finance','Acme Legal LLP','HR Wellness Partners','Customs Office','Internal HQ','Logistics Vendor')
$statuses    = @('registered','waiting_department','waiting_records','returned_department','returned_records','approved','rejected')

# Each row: { receivedOffsetDays; dueOffsetDays; statusBucket }
# Spread so every sidebar filter has matches.
$schedule = @(
  # Overdue (due_date in past)
  @{ recv=-14; due=-7;  st='waiting_department' },
  @{ recv=-12; due=-5;  st='returned_department' },
  @{ recv=-10; due=-3;  st='waiting_records' },
  @{ recv=-9;  due=-2;  st='waiting_department' },
  @{ recv=-8;  due=-1;  st='returned_records' },
  # Due today (due_date == today)
  @{ recv=-6;  due=0;   st='waiting_department' },
  @{ recv=-5;  due=0;   st='waiting_records' },
  # Due this week (due_date 1..7 days out)
  @{ recv=-4;  due=2;   st='waiting_department' },
  @{ recv=-3;  due=4;   st='waiting_records' },
  @{ recv=-2;  due=6;   st='waiting_department' },
  @{ recv=-1;  due=7;   st='registered' },
  # Received today (recv = today)
  @{ recv=0;   due=10;  st='registered' },
  @{ recv=0;   due=14;  st='registered' },
  @{ recv=0;   due=5;   st='waiting_department' },
  # Future (calm queue)
  @{ recv=1;   due=21;  st='registered' },
  @{ recv=2;   due=30;  st='registered' },
  # Closed (approved / rejected)
  @{ recv=-20; due=-13; st='approved' },
  @{ recv=-18; due=-11; st='approved' },
  @{ recv=-16; due=-9;  st='approved' },
  @{ recv=-15; due=-8;  st='rejected' },
  @{ recv=-22; due=-15; st='rejected' }
)

$conn = [System.Data.SqlClient.SqlConnection]::new($ConnStr); $conn.Open()
$inserted = 0
$rand = [System.Random]::new(42)
foreach ($s in $schedule) {
  $owner = $owners[$rand.Next($owners.Count)]
  $dept  = $departments[$rand.Next($departments.Count)]
  $dir   = $directions[$rand.Next($directions.Count)]
  $type  = $docTypes[$rand.Next($docTypes.Count)]
  $src   = $sources[$rand.Next($sources.Count)]
  $recv  = $today.AddDays($s.recv)
  $due   = $today.AddDays($s.due)
  $reg   = "REG-2026-" + (200 + $inserted).ToString('000')
  $title = switch ($type) {
    'Official Letter' { "$dir Letter / $($src.Split(' ')[0]) Acknowledgement" }
    'Circular'        { "$dir Circular / $dept Update" }
    'Meeting Minutes' { "$dept Meeting Minutes / $($recv.ToString('MMM yyyy'))" }
    'Decision Notice' { "$dept Decision Notice / Action $($recv.Day)" }
    'Contract Annex'  { "$dir Contract Annex / $($src.Split(' ')[0])" }
  }
  $summary = "$type from $src routed to $dept. Action required before $($due.ToString('dd MMM yyyy'))."
  $data = [ordered]@{
    document_title         = $title
    registry_number        = $reg
    owner_name             = $owner.Name
    owner_email            = $owner.Email
    department             = $dept
    direction              = $dir
    document_type          = $type
    source_organization    = $src
    received_date          = $recv.ToString('yyyy-MM-dd')
    due_date               = $due.ToString('yyyy-MM-dd')
    records_officer_email  = 'records.officer@acme.com'
    document_summary       = $summary
    routing_notes          = "Please process within the routing window. Tag $dept handler."
  }
  $json = $data | ConvertTo-Json -Depth 6 -Compress
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = @"
INSERT INTO MF_Submissions (FormId, DataJson, IpAddress, UserAgent, UserId, Status, IsSpam, SpamScore, SubmittedOnUtc, ReadOnUtc, ModifiedOnUtc, ModifiedByUserId)
VALUES (@formId, @data, '127.0.0.1', 'seed-script', NULL, @status, 0, 0, @submitted, NULL, @submitted, NULL)
"@
  [void]$cmd.Parameters.AddWithValue('@formId', $FormId)
  [void]$cmd.Parameters.AddWithValue('@data', $json)
  [void]$cmd.Parameters.AddWithValue('@status', $s.st)
  # Use received_date as submittedOnUtc so sort + date filters line up
  [void]$cmd.Parameters.AddWithValue('@submitted', $recv.AddHours(9))
  [void]$cmd.ExecuteNonQuery()
  $inserted++
}
$conn.Close()
Write-Output "Seeded $inserted diverse Document submissions"
