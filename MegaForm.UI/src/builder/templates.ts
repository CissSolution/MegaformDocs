/* ============================================================
   MegaForm Builder — Templates v6.0
   3 rich templates với validation + conditional rules + skip logic
   ============================================================ */
import { MegaFormBuilder } from './core';
import { TEMPLATES as CONFIG_TEMPLATES } from '@config/templates';
(function () {
    'use strict';
    var B = MegaFormBuilder;

    /* ── blank ─────────────────────────────────────────────── */
    var blank: any = {
        title: 'Untitled Form', description: '', submitButtonText: 'Submit',
        category: 'general', icon: '📋', fields: [], customHtml: '', customCss: '',
        settings: {}
    };

    /* ── golf-scorecard preset (uses GG_* tables on DashboardDatabase) ── */
    var GOLF_LEADERBOARD_SQL = "SELECT F.FlightName, L.Pos, L.PosLabel, P.PlayerName, L.TotalToPar, L.R1Score, L.R1Course, L.R2Score, L.R2Course, L.R3Score, L.R3Course, COALESCE(CAST(L.TotalNet AS VARCHAR),'DNF') AS TotalNet FROM GG_Leaderboard L JOIN GG_Players P ON P.PlayerId = L.PlayerId JOIN GG_Flights F ON F.FlightId = L.FlightId WHERE (:flightId IS NULL OR L.FlightId = :flightId) ORDER BY F.SortOrder, L.Pos";
    var GOLF_SCORECARD_SQL  = "SELECT R.RoundLabel, C.CourseName, C.Tee, CAST(C.Slope AS VARCHAR)+' / '+CAST(C.CourseRating AS VARCHAR) AS SlopeRating, S.Handicap, C.H1Y,C.H2Y,C.H3Y,C.H4Y,C.H5Y,C.H6Y,C.H7Y,C.H8Y,C.H9Y, C.OutYard, C.H10Y,C.H11Y,C.H12Y,C.H13Y,C.H14Y,C.H15Y,C.H16Y,C.H17Y,C.H18Y, C.InYard, C.TotalYard, C.H1P,C.H2P,C.H3P,C.H4P,C.H5P,C.H6P,C.H7P,C.H8P,C.H9P, C.OutPar, C.H10P,C.H11P,C.H12P,C.H13P,C.H14P,C.H15P,C.H16P,C.H17P,C.H18P, C.InPar, C.Par, C.H1SI,C.H2SI,C.H3SI,C.H4SI,C.H5SI,C.H6SI,C.H7SI,C.H8SI,C.H9SI, C.H10SI,C.H11SI,C.H12SI,C.H13SI,C.H14SI,C.H15SI,C.H16SI,C.H17SI,C.H18SI, S.H1,S.H2,S.H3,S.H4,S.H5,S.H6,S.H7,S.H8,S.H9, S.OutTotal, S.H10,S.H11,S.H12,S.H13,S.H14,S.H15,S.H16,S.H17,S.H18, S.InTotal, S.Total, S.Net FROM GG_Scorecards S JOIN GG_Rounds R ON R.RoundId = S.RoundId JOIN GG_Courses C ON C.CourseId = R.CourseId JOIN GG_Players P ON P.PlayerId = S.PlayerId WHERE P.PlayerName = :parentId ORDER BY R.RoundDate DESC";
    var GOLF_FLIGHTS_SQL    = "SELECT FlightId, FlightName FROM GG_Flights ORDER BY SortOrder";

    var GOLF_SETUP_SQL = [
        '-- ============================================================',
        '--  MegaForm  Golf Tournament Sample Schema (SQL Server)',
        '--  Idempotent  safe to re-run. Target: DashboardDatabase',
        '-- ============================================================',
        '',
        "IF OBJECT_ID('GG_Flights', 'U') IS NULL",
        'CREATE TABLE GG_Flights (',
        '  FlightId   INT IDENTITY(1,1) PRIMARY KEY,',
        '  FlightName NVARCHAR(100) NOT NULL,',
        '  SortOrder  INT NOT NULL DEFAULT 0',
        ');',
        '',
        "IF OBJECT_ID('GG_Players', 'U') IS NULL",
        'CREATE TABLE GG_Players (',
        '  PlayerId   INT IDENTITY(1,1) PRIMARY KEY,',
        '  PlayerName NVARCHAR(150) NOT NULL',
        ');',
        '',
        "IF OBJECT_ID('GG_Courses', 'U') IS NULL",
        'CREATE TABLE GG_Courses (',
        '  CourseId      INT IDENTITY(1,1) PRIMARY KEY,',
        '  CourseName    NVARCHAR(150) NOT NULL,',
        '  Tee           NVARCHAR(50)  NULL,',
        '  Slope         INT           NULL,',
        '  CourseRating  DECIMAL(5,2)  NULL,',
        '  H1Y INT NULL, H2Y INT NULL, H3Y INT NULL, H4Y INT NULL, H5Y INT NULL,',
        '  H6Y INT NULL, H7Y INT NULL, H8Y INT NULL, H9Y INT NULL, OutYard INT NULL,',
        '  H10Y INT NULL, H11Y INT NULL, H12Y INT NULL, H13Y INT NULL, H14Y INT NULL,',
        '  H15Y INT NULL, H16Y INT NULL, H17Y INT NULL, H18Y INT NULL, InYard INT NULL,',
        '  TotalYard INT NULL,',
        '  H1P INT NULL, H2P INT NULL, H3P INT NULL, H4P INT NULL, H5P INT NULL,',
        '  H6P INT NULL, H7P INT NULL, H8P INT NULL, H9P INT NULL, OutPar INT NULL,',
        '  H10P INT NULL, H11P INT NULL, H12P INT NULL, H13P INT NULL, H14P INT NULL,',
        '  H15P INT NULL, H16P INT NULL, H17P INT NULL, H18P INT NULL, InPar INT NULL,',
        '  Par INT NULL,',
        '  H1SI INT NULL, H2SI INT NULL, H3SI INT NULL, H4SI INT NULL, H5SI INT NULL,',
        '  H6SI INT NULL, H7SI INT NULL, H8SI INT NULL, H9SI INT NULL,',
        '  H10SI INT NULL, H11SI INT NULL, H12SI INT NULL, H13SI INT NULL, H14SI INT NULL,',
        '  H15SI INT NULL, H16SI INT NULL, H17SI INT NULL, H18SI INT NULL',
        ');',
        '',
        "IF OBJECT_ID('GG_Rounds', 'U') IS NULL",
        'CREATE TABLE GG_Rounds (',
        '  RoundId    INT IDENTITY(1,1) PRIMARY KEY,',
        '  CourseId   INT NOT NULL REFERENCES GG_Courses(CourseId),',
        '  RoundLabel NVARCHAR(50) NOT NULL,',
        '  RoundDate  DATE NOT NULL',
        ');',
        '',
        "IF OBJECT_ID('GG_Scorecards', 'U') IS NULL",
        'CREATE TABLE GG_Scorecards (',
        '  ScorecardId INT IDENTITY(1,1) PRIMARY KEY,',
        '  PlayerId    INT NOT NULL REFERENCES GG_Players(PlayerId),',
        '  RoundId     INT NOT NULL REFERENCES GG_Rounds(RoundId),',
        '  Handicap    INT NULL,',
        '  H1 INT NULL, H2 INT NULL, H3 INT NULL, H4 INT NULL, H5 INT NULL,',
        '  H6 INT NULL, H7 INT NULL, H8 INT NULL, H9 INT NULL, OutTotal INT NULL,',
        '  H10 INT NULL, H11 INT NULL, H12 INT NULL, H13 INT NULL, H14 INT NULL,',
        '  H15 INT NULL, H16 INT NULL, H17 INT NULL, H18 INT NULL, InTotal INT NULL,',
        '  Total INT NULL, Net INT NULL',
        ');',
        '',
        "IF OBJECT_ID('GG_Leaderboard', 'U') IS NULL",
        'CREATE TABLE GG_Leaderboard (',
        '  LeaderboardId INT IDENTITY(1,1) PRIMARY KEY,',
        '  FlightId      INT NOT NULL REFERENCES GG_Flights(FlightId),',
        '  PlayerId      INT NOT NULL REFERENCES GG_Players(PlayerId),',
        '  Pos           INT NULL,',
        '  PosLabel      NVARCHAR(20) NULL,',
        '  TotalToPar    INT NULL,',
        '  R1Score       INT NULL, R1Course NVARCHAR(100) NULL,',
        '  R2Score       INT NULL, R2Course NVARCHAR(100) NULL,',
        '  R3Score       INT NULL, R3Course NVARCHAR(100) NULL,',
        '  TotalNet      INT NULL',
        ');',
        '',
        '-- Sample seed (only if Flights table is empty)',
        'IF NOT EXISTS (SELECT 1 FROM GG_Flights)',
        'BEGIN',
        '  INSERT INTO GG_Flights (FlightName, SortOrder) VALUES',
        "    ('Flight A - Low Gross', 1),",
        "    ('Flight B - Low Net',   2),",
        "    ('Flight C - Low Gross', 3);",
        '',
        '  INSERT INTO GG_Players (PlayerName) VALUES',
        "    ('Andy Tran'), ('Mike Tanaka'), ('Bill Sanders'), ('Frank Miller'), ('Richard Park');",
        '',
        '  INSERT INTO GG_Courses (CourseName, Tee, Slope, CourseRating,',
        '    H1Y,H2Y,H3Y,H4Y,H5Y,H6Y,H7Y,H8Y,H9Y, OutYard,',
        '    H10Y,H11Y,H12Y,H13Y,H14Y,H15Y,H16Y,H17Y,H18Y, InYard, TotalYard,',
        '    H1P,H2P,H3P,H4P,H5P,H6P,H7P,H8P,H9P, OutPar,',
        '    H10P,H11P,H12P,H13P,H14P,H15P,H16P,H17P,H18P, InPar, Par,',
        '    H1SI,H2SI,H3SI,H4SI,H5SI,H6SI,H7SI,H8SI,H9SI,',
        '    H10SI,H11SI,H12SI,H13SI,H14SI,H15SI,H16SI,H17SI,H18SI)',
        "  VALUES ('RecPark', 'White', 122, 70.5,",
        '    380,165,420,510,395,180,440,520,360, 3370,',
        '    405,170,425,500,390,175,445,515,375, 3400, 6770,',
        '    4,3,4,5,4,3,4,5,4, 36,',
        '    4,3,4,5,4,3,4,5,4, 36, 72,',
        '    7,15,3,11,5,17,1,9,13,',
        '    8,16,4,12,6,18,2,10,14);',
        '',
        '  DECLARE @CourseId INT = SCOPE_IDENTITY();',
        "  INSERT INTO GG_Rounds (CourseId, RoundLabel, RoundDate) VALUES (@CourseId, 'Round 1', GETDATE());",
        '  DECLARE @RoundId INT = SCOPE_IDENTITY();',
        '',
        '  INSERT INTO GG_Scorecards (PlayerId, RoundId, Handicap,',
        '    H1,H2,H3,H4,H5,H6,H7,H8,H9, OutTotal,',
        '    H10,H11,H12,H13,H14,H15,H16,H17,H18, InTotal, Total, Net)',
        '  SELECT PlayerId, @RoundId, 12,',
        '    4,3,5,5,4,3,5,6,4, 39,',
        '    4,3,4,5,4,3,5,5,4, 37, 76, 64',
        "  FROM GG_Players WHERE PlayerName = 'Andy Tran';",
        '',
        '  INSERT INTO GG_Leaderboard (FlightId, PlayerId, Pos, PosLabel, TotalToPar,',
        '    R1Score, R1Course, R2Score, R2Course, R3Score, R3Course, TotalNet)',
        "  SELECT 1, PlayerId, 4, '4', 0, 72, 'RecPark', 73, 'SKY', 72, 'Eldo', 217 FROM GG_Players WHERE PlayerName = 'Richard Park';",
        '  INSERT INTO GG_Leaderboard (FlightId, PlayerId, Pos, PosLabel, TotalToPar,',
        '    R1Score, R1Course, R2Score, R2Course, R3Score, R3Course, TotalNet)',
        "  SELECT 1, PlayerId, 5, '5', 2, 73, 'RecPark', 72, 'SKY', 73, 'Eldo', 218 FROM GG_Players WHERE PlayerName = 'Andy Tran';",
        '  INSERT INTO GG_Leaderboard (FlightId, PlayerId, Pos, PosLabel, TotalToPar,',
        '    R1Score, R1Course, R2Score, R2Course, R3Score, R3Course, TotalNet)',
        "  SELECT 1, PlayerId, 6, '6', 3, 74, 'RecPark', 73, 'SKY', 72, 'Eldo', 219 FROM GG_Players WHERE PlayerName = 'Mike Tanaka';",
        'END;'
    ].join('\n');

    var golfScorecard: any = {
        id: 'golf-scorecard',
        title: 'Golf Tournament Scoreboard',
        description: 'Live leaderboard with drill-down player scorecard. Reads from GG_* tables on DashboardDatabase.',
        submitButtonText: 'Submit',
        category: 'reports', icon: '⛳',
        fields: [
            {
                key: 'leaderboard', type: 'DataRepeater', label: 'Leaderboard',
                widgetProps: {
                    connectionKey:     'DashboardDatabase',
                    databaseType:      'SqlServer',
                    masterQuery:       GOLF_LEADERBOARD_SQL,
                    groupByCol:        'FlightName',
                    golfMode:          true,
                    detail1TriggerCol: 'PlayerName',
                    emptyMessage:      'No leaderboard data.',
                    filter1Label:      'Flight',
                    filter1Param:      'flightId',
                    filter1Type:       'dropdown',
                    filter1Query:      GOLF_FLIGHTS_SQL
                }
            },
            {
                key: 'scorecard', type: 'GolfScorecard', label: 'Player Scorecard',
                widgetProps: {
                    connectionKey:  'DashboardDatabase',
                    databaseType:   'SqlServer',
                    scorecardQuery: GOLF_SCORECARD_SQL,
                    listenEvent:    'mfw:drill-down',
                    emptyMessage:   'Select a player to view scorecard.',
                    cardTemplate: [
                        '<div class="mfgs-round">',
                        '  <div class="mfgs-round-hdr"><strong>{roundLabel}</strong> &middot; {courseName} <span class="mfgs-tee">({tee})</span></div>',
                        '  <div class="mfgs-slope">SLOPE/Rating: {slopeRating} &middot; Handicap: {handicap}</div>',
                        '  <table class="mfgs-table">',
                        '    <thead><tr class="mfgs-holes">',
                        '      <th></th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th>',
                        '      <th class="mfgs-sep">Out</th>',
                        '      <th>10</th><th>11</th><th>12</th><th>13</th><th>14</th><th>15</th><th>16</th><th>17</th><th>18</th>',
                        '      <th class="mfgs-sep">In</th><th class="mfgs-sep">Total</th><th class="mfgs-sep">Net</th>',
                        '    </tr></thead>',
                        '    <tbody>',
                        '      <tr class="mfgs-yardage"><td>Yard</td>',
                        '        <td>{h1Y}</td><td>{h2Y}</td><td>{h3Y}</td><td>{h4Y}</td><td>{h5Y}</td><td>{h6Y}</td><td>{h7Y}</td><td>{h8Y}</td><td>{h9Y}</td>',
                        '        <td class="mfgs-sep">{outYard}</td>',
                        '        <td>{h10Y}</td><td>{h11Y}</td><td>{h12Y}</td><td>{h13Y}</td><td>{h14Y}</td><td>{h15Y}</td><td>{h16Y}</td><td>{h17Y}</td><td>{h18Y}</td>',
                        '        <td class="mfgs-sep">{inYard}</td><td class="mfgs-sep">{totalYard}</td><td></td>',
                        '      </tr>',
                        '      <tr class="mfgs-par-row"><td>Par</td>',
                        '        <td>{h1P}</td><td>{h2P}</td><td>{h3P}</td><td>{h4P}</td><td>{h5P}</td><td>{h6P}</td><td>{h7P}</td><td>{h8P}</td><td>{h9P}</td>',
                        '        <td class="mfgs-sep">{outPar}</td>',
                        '        <td>{h10P}</td><td>{h11P}</td><td>{h12P}</td><td>{h13P}</td><td>{h14P}</td><td>{h15P}</td><td>{h16P}</td><td>{h17P}</td><td>{h18P}</td>',
                        '        <td class="mfgs-sep">{inPar}</td><td class="mfgs-sep">{par}</td><td></td>',
                        '      </tr>',
                        '      <tr class="mfgs-si-row"><td>SI</td>',
                        '        <td>{h1SI}</td><td>{h2SI}</td><td>{h3SI}</td><td>{h4SI}</td><td>{h5SI}</td><td>{h6SI}</td><td>{h7SI}</td><td>{h8SI}</td><td>{h9SI}</td>',
                        '        <td class="mfgs-sep"></td>',
                        '        <td>{h10SI}</td><td>{h11SI}</td><td>{h12SI}</td><td>{h13SI}</td><td>{h14SI}</td><td>{h15SI}</td><td>{h16SI}</td><td>{h17SI}</td><td>{h18SI}</td>',
                        '        <td class="mfgs-sep"></td><td class="mfgs-sep"></td><td></td>',
                        '      </tr>',
                        '      <tr class="mfgs-score-row"><td class="mfgs-player-label">{roundLabel}</td>',
                        '        <td class="{h1Class}">{h1}</td><td class="{h2Class}">{h2}</td><td class="{h3Class}">{h3}</td><td class="{h4Class}">{h4}</td><td class="{h5Class}">{h5}</td><td class="{h6Class}">{h6}</td><td class="{h7Class}">{h7}</td><td class="{h8Class}">{h8}</td><td class="{h9Class}">{h9}</td>',
                        '        <td class="mfgs-sep mfgs-total">{outTotal}</td>',
                        '        <td class="{h10Class}">{h10}</td><td class="{h11Class}">{h11}</td><td class="{h12Class}">{h12}</td><td class="{h13Class}">{h13}</td><td class="{h14Class}">{h14}</td><td class="{h15Class}">{h15}</td><td class="{h16Class}">{h16}</td><td class="{h17Class}">{h17}</td><td class="{h18Class}">{h18}</td>',
                        '        <td class="mfgs-sep mfgs-total">{inTotal}</td><td class="mfgs-sep mfgs-total">{total}</td><td class="mfgs-sep mfgs-total">{net}</td>',
                        '      </tr>',
                        '    </tbody>',
                        '  </table>',
                        '</div>'
                    ].join('\n'),
                    cardCss: [
                        '.mfgs-wrap { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; }',
                        '.mfgs-round { margin-bottom: 8px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }',
                        '.mfgs-round-hdr { background: #3b5998; color: #fff; padding: 8px 12px; font-size: 14px; }',
                        '.mfgs-tee { opacity: 0.8; font-weight: normal; }',
                        '.mfgs-slope { background: #f0f0f0; padding: 4px 12px; font-size: 11px; color: #555; border-bottom: 1px solid #ddd; }',
                        '.mfgs-table { width: 100%; border-collapse: collapse; text-align: center; font-size: 12px; }',
                        '.mfgs-table th, .mfgs-table td { padding: 3px 2px; border: 1px solid #ccc; min-width: 26px; }',
                        '.mfgs-table th { background: #e8e8e8; font-weight: 600; font-size: 11px; }',
                        '.mfgs-table td:first-child, .mfgs-table th:first-child { text-align: left; min-width: 60px; font-weight: 600; font-size: 11px; background: #f8f8f8; }',
                        '.mfgs-sep { font-weight: 700 !important; background: #f0f0f0 !important; border-left: 2px solid #999 !important; }',
                        '.mfgs-total { font-size: 13px; }',
                        '.mfgs-yardage td { background: #fafafa; color: #666; font-size: 11px; }',
                        '.mfgs-par-row td { background: #f5f5f5; font-weight: 600; }',
                        '.mfgs-si-row td  { background: #fafafa; color: #888; font-size: 10px; font-style: italic; }',
                        '.mfgs-score-row td { font-weight: 700; font-size: 13px; text-align: center; vertical-align: middle; }',
                        '.mfgs-eagle  { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; border: 2px double #28a745; color: #28a745; font-weight: 900; }',
                        '.mfgs-birdie { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; border: 2px solid #999; font-weight: 700; }',
                        '.mfgs-par    { font-weight: 400; }',
                        '.mfgs-bogey  { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 2px;  border: 2px solid #999; font-weight: 700; }',
                        '.mfgs-dblbogey { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 2px; border: 3px double #666; font-weight: 900; }'
                    ].join('\n')
                }
            }
        ],
        customHtml: [
            '<div class="golf-tournament">',
            '  <header class="golf-tournament-hero">',
            '    <h1>{{form:title}}</h1>',
            '    <p>{{form:description}}</p>',
            '  </header>',
            '  <section class="golf-section golf-leaderboard-pane">',
            '    <h2 class="golf-section-title">Leaderboard</h2>',
            '    {{field:leaderboard}}',
            '  </section>',
            '  <section class="golf-section golf-scorecard-pane">',
            '    <h2 class="golf-section-title">Player Scorecard</h2>',
            '    {{field:scorecard}}',
            '  </section>',
            '</div>'
        ].join('\n'),
        customCss: [
            '.golf-tournament { max-width: 1180px; margin: 0 auto; padding: 18px; font-family: "Inter", system-ui, sans-serif; color: #0f172a; }',
            '.golf-tournament-hero { background: linear-gradient(135deg,#064e3b,#047857); color:#fff; padding:24px 28px; border-radius:14px; margin-bottom:18px; box-shadow:0 8px 24px rgba(4,120,87,.18); }',
            '.golf-tournament-hero h1 { margin:0; font-size:24px; font-weight:700; letter-spacing:.2px; }',
            '.golf-tournament-hero p  { margin:6px 0 0; opacity:.85; font-size:13px; }',
            '.golf-section { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:18px; margin-bottom:16px; box-shadow:0 4px 12px rgba(15,23,42,.04); }',
            '.golf-section-title { margin:0 0 12px; font-size:15px; font-weight:700; color:#065f46; text-transform:uppercase; letter-spacing:.06em; }'
        ].join('\n'),
        settings: { displayOnly: true },
        setupSql: GOLF_SETUP_SQL
    };

    /* ==========================================================
       HELPER: tạo rule definition
       ========================================================== */
    function mkRule(id: string, name: string, priority: number,
        condField: string, condOp: string, condVal: string,
        thenActions: any[], elseActions: any[]) {
        return {
            id, name, enabled: true, priority,
            when: { id: id+'_grp', type: 'group', logic: 'all', children: [
                { id: id+'_cond', type: 'rule', field: condField, operator: condOp, value: condVal }
            ]},
            then: thenActions,
            else: elseActions
        };
    }
    function act(id: string, action: string, target: string, targetType = 'field') {
        return { id, action, targetType, target };
    }

    /* ==========================================================
       TEMPLATE 1: JOB APPLICATION
       4 bước · skip trang Experience nếu Fresher · portfolio required nếu Senior
       ========================================================== */
    var jobApp: any = {
        title: 'Job Application Form',
        description: 'Apply for a position — form adapts based on your experience level',
        submitButtonText: '📤 Submit Application',
        category: 'hr', icon: '💼',
        fields: [
            /* ── BƯỚC 1: Thông tin cá nhân ── */
            { key:'step1', type:'Section', label:'Personal Information', properties:{pageBreak:false} },
            { key:'row_name', type:'Row', columns:[
                { span:6, fields:[{ key:'first_name', type:'Text', label:'First Name', required:true, placeholder:'Jane',
                    validation:{ minLength:2, maxLength:50, customMessage:'Name must be 2–50 characters' } }]},
                { span:6, fields:[{ key:'last_name', type:'Text', label:'Last Name', required:true, placeholder:'Smith',
                    validation:{ minLength:2, maxLength:50 } }]}
            ]},
            { key:'row_contact', type:'Row', columns:[
                { span:6, fields:[{ key:'email', type:'Email', label:'Email', required:true, placeholder:'jane@email.com',
                    validation:{ pattern:'^[^@]+@[^@]+\\.[^@]+$', customMessage:'Please enter a valid email address' } }]},
                { span:6, fields:[{ key:'phone', type:'Phone', label:'Phone', required:true, placeholder:'+84 123 456 789',
                    validation:{ pattern:'^[\\+]?[0-9\\s\\-]{8,15}$', customMessage:'Enter a valid phone (8–15 digits)' } }]}
            ]},
            { key:'address', type:'Textarea', label:'Current Address', placeholder:'Street, City, Province, ZIP',
                validation:{ maxLength:300 } },
            { key:'row_pos', type:'Row', columns:[
                { span:6, fields:[{ key:'position', type:'Select', label:'Position Applied For', required:true, options:[
                    {label:'Frontend Developer', value:'frontend'},
                    {label:'Backend Developer', value:'backend'},
                    {label:'UX Designer', value:'ux'},
                    {label:'Product Manager', value:'pm'},
                    {label:'Data Analyst', value:'data'}
                ]}]},
                { span:6, fields:[{ key:'exp_level', type:'Radio', label:'Experience Level', required:true, options:[
                    {label:'🌱 Fresher (0–1 yr)', value:'fresher'},
                    {label:'📈 Mid-level (2–5 yr)', value:'mid'},
                    {label:'🏆 Senior (5+ yr)', value:'senior'}
                ]}]}
            ]},
            /* Loại hình làm việc */
            { key:'work_type', type:'Radio', label:'Work Preference', required:true, options:[
                {label:'🏢 On-site (HCM)', value:'onsite'},
                {label:'🏠 Remote', value:'remote'},
                {label:'🔄 Hybrid', value:'hybrid'}
            ]},
            /* Địa điểm văn phòng — ẩn nếu Remote (showIf per-field) */
            { key:'office_location', type:'Select', label:'Preferred Office Location',
              showIf:{ operator:'And', conditions:[{ fieldKey:'work_type', operator:'NotEquals', value:'remote' }]},
              options:[
                {label:'Ho Chi Minh City', value:'hcm'},
                {label:'Ha Noi', value:'hn'},
                {label:'Da Nang', value:'dn'}
            ]},
            /* Disability + accommodation */
            { key:'has_disability', type:'Checkbox', label:'Accessibility',
              options:[{label:'I require workplace accessibility accommodations', value:'yes'}] },
            { key:'accommodation_needs', type:'Textarea', label:'Accommodation Details',
              placeholder:'Please describe your needs...',
              showIf:{ operator:'And', conditions:[{ fieldKey:'has_disability', operator:'Contains', value:'yes' }]},
              validation:{ maxLength:500 } },

            /* ── BƯỚC 2: Kinh nghiệm làm việc (Fresher sẽ bị skip qua Rule) ── */
            { key:'step2', type:'Section', label:'Work Experience', properties:{pageBreak:true} },
            /* Banner note — chỉ hiện cho Fresher qua Rule */
            { key:'fresher_note', type:'Html', label:'', htmlContent:
                '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin-bottom:16px">'+
                '<b style="color:#16a34a">✅ No experience required for Freshers!</b>'+
                '<p style="margin:8px 0 0;color:#166534">This page will be skipped automatically. Just click <b>Next</b> to continue to the next step.</p></div>'
            },
            { key:'current_company', type:'Text', label:'Current / Last Company', placeholder:'Acme Corp' },
            { key:'job_title_current', type:'Text', label:'Current / Last Job Title', placeholder:'Senior Developer' },
            { key:'row_dates', type:'Row', columns:[
                { span:6, fields:[{ key:'start_date', type:'Date', label:'Start Date' }]},
                { span:6, fields:[{ key:'end_date', type:'Date', label:'End Date (leave blank if current)' }]}
            ]},
            { key:'job_desc', type:'Textarea', label:'Key Responsibilities & Achievements',
              placeholder:'Describe your main responsibilities...',
              validation:{ minLength:50, maxLength:1000, customMessage:'Describe at least 50 characters of experience' } },
            { key:'skills', type:'Checkbox', label:'Technical Skills', options:[
                {label:'JavaScript / TypeScript', value:'js'},
                {label:'React / Vue / Angular', value:'frontend_fw'},
                {label:'Node.js / Python / Java', value:'backend'},
                {label:'SQL / NoSQL Databases', value:'db'},
                {label:'Docker / Kubernetes / CI-CD', value:'devops'},
                {label:'UI/UX & Figma', value:'design'},
                {label:'AWS / Azure / GCP', value:'cloud'}
            ]},
            { key:'salary_exp', type:'Text', label:'Expected Salary (USD/month)',
              placeholder:'2,000 – 3,500',
              validation:{ pattern:'^[\\d,\\s–\\-\\.]+$', customMessage:'Enter salary range, e.g. 2000 – 3500' } },

            /* ── BƯỚC 3: Portfolio & Documents ── */
            { key:'step3', type:'Section', label:'Portfolio & Documents', properties:{pageBreak:true} },
            { key:'portfolio_url', type:'Url', label:'Portfolio / GitHub URL',
              placeholder:'https://github.com/yourname',
              validation:{ pattern:'^https?://.+', customMessage:'Must start with http:// or https://' } },
            { key:'linkedin', type:'Url', label:'LinkedIn Profile', placeholder:'https://linkedin.com/in/yourname' },
            { key:'resume', type:'File', label:'Resume / CV', required:true,
              fileSettings:{ maxSizeMB:5, allowedExtensions:['.pdf','.doc','.docx'] } },
            { key:'cover_letter', type:'Textarea', label:'Cover Letter',
              placeholder:"Tell us why you're the perfect fit...",
              validation:{ minLength:100, maxLength:2000, customMessage:'Cover letter: 100–2000 characters' } },

            /* ── BƯỚC 4: Sẵn sàng & Đồng ý ── */
            { key:'step4', type:'Section', label:'Availability & Consent', properties:{pageBreak:true} },
            { key:'row_avail', type:'Row', columns:[
                { span:6, fields:[{ key:'available_from', type:'Date', label:'Available From', required:true }]},
                { span:6, fields:[{ key:'notice_period', type:'Select', label:'Notice Period', options:[
                    {label:'Immediately', value:'0'},
                    {label:'2 weeks', value:'2w'},
                    {label:'1 month', value:'1m'},
                    {label:'2 months', value:'2m'},
                    {label:'3 months', value:'3m'}
                ]}]}
            ]},
            { key:'referral', type:'Text', label:'How did you hear about us?',
              placeholder:'LinkedIn, friend referral, company website...' },
            { key:'consent', type:'Checkbox', label:'Agreement', required:true, options:[
                {label:'I confirm all information above is accurate and complete', value:'accurate'},
                {label:'I agree to the privacy policy and data processing terms', value:'privacy'}
            ]}
        ],
        settings: {
            multiPage: true,
            rules: [
                /* Rule 1 — Fresher → ẩn tất cả fields kinh nghiệm */
                mkRule('rule_fresher','Skip Experience page for Freshers',1,
                    'exp_level','eq','fresher',
                    [
                        act('a1','show','fresher_note'),
                        act('a2','hide','current_company'), act('a3','hide','job_title_current'),
                        act('a4','hide','row_dates'),       act('a5','hide','job_desc'),
                        act('a6','hide','skills'),          act('a7','hide','salary_exp'),
                        act('a8','optional','portfolio_url')
                    ],
                    [
                        act('b1','hide','fresher_note'),
                        act('b2','show','current_company'), act('b3','show','job_title_current'),
                        act('b4','show','row_dates'),       act('b5','show','job_desc'),
                        act('b6','show','skills'),          act('b7','show','salary_exp')
                    ]
                ),
                /* Rule 2 — Senior → bắt buộc portfolio */
                mkRule('rule_senior','Require portfolio for Senior applicants',2,
                    'exp_level','eq','senior',
                    [ act('c1','require','portfolio_url') ],
                    [ act('c2','optional','portfolio_url') ]
                )
            ]
        },
        customHtml:'', customCss:''
    };

    /* ==========================================================
       TEMPLATE 2: MEDICAL INTAKE FORM
       3 bước · conditional diabetes/pregnancy fields · bảo hiểm toggle
       ========================================================== */
    var medicalIntake: any = {
        title: 'Patient Intake Form',
        description: 'Complete before your appointment — fields adapt based on your health history',
        submitButtonText: '🏥 Submit Intake Form',
        category: 'healthcare', icon: '🏥',
        fields: [
            /* ── BƯỚC 1: Thông tin bệnh nhân ── */
            { key:'ms1', type:'Section', label:'Patient Information', properties:{pageBreak:false} },
            { key:'mrow_name', type:'Row', columns:[
                { span:4, fields:[{ key:'m_first', type:'Text', label:'First Name', required:true, placeholder:'Nguyen',
                    validation:{ minLength:2, maxLength:50 } }]},
                { span:4, fields:[{ key:'m_last', type:'Text', label:'Last Name', required:true, placeholder:'Van A',
                    validation:{ minLength:2, maxLength:50 } }]},
                { span:4, fields:[{ key:'m_dob', type:'Date', label:'Date of Birth', required:true }]}
            ]},
            { key:'mrow_info', type:'Row', columns:[
                { span:4, fields:[{ key:'m_gender', type:'Radio', label:'Gender', required:true, options:[
                    {label:'Male', value:'male'},{label:'Female', value:'female'},{label:'Other', value:'other'}
                ]}]},
                { span:4, fields:[{ key:'m_phone', type:'Phone', label:'Phone', required:true, placeholder:'0901 234 567',
                    validation:{ pattern:'^[0-9+\\s]{9,15}$', customMessage:'Enter a valid Vietnamese phone number' } }]},
                { span:4, fields:[{ key:'m_email', type:'Email', label:'Email', placeholder:'patient@email.com' }]}
            ]},
            { key:'m_address', type:'Textarea', label:'Home Address', required:true,
              placeholder:'Street, District, City', validation:{ maxLength:250 } },
            /* Thai kỳ — chỉ hiện cho nữ (showIf) */
            { key:'m_pregnant', type:'Radio', label:'Are you currently pregnant?',
              showIf:{ operator:'And', conditions:[{ fieldKey:'m_gender', operator:'Equals', value:'female' }]},
              options:[{label:'Yes', value:'yes'},{label:'No', value:'no'}] },
            /* Tam cá nguyệt — hiện khi có thai */
            { key:'m_trimester', type:'Select', label:'Trimester',
              showIf:{ operator:'And', conditions:[{ fieldKey:'m_pregnant', operator:'Equals', value:'yes' }]},
              options:[
                {label:'1st Trimester (weeks 1–12)', value:'q1'},
                {label:'2nd Trimester (weeks 13–26)', value:'q2'},
                {label:'3rd Trimester (weeks 27–40)', value:'q3'}
            ]},

            /* ── BƯỚC 2: Lịch sử sức khoẻ ── */
            { key:'ms2', type:'Section', label:'Medical History', properties:{pageBreak:true} },
            { key:'mrow_health', type:'Row', columns:[
                { span:6, fields:[{ key:'m_blood', type:'Select', label:'Blood Type', options:[
                    {label:'Unknown', value:'unknown'},{label:'A+', value:'a+'},{label:'A-', value:'a-'},
                    {label:'B+', value:'b+'},{label:'B-', value:'b-'},{label:'AB+', value:'ab+'},
                    {label:'AB-', value:'ab-'},{label:'O+', value:'o+'},{label:'O-', value:'o-'}
                ]}]},
                { span:6, fields:[{ key:'m_allergies', type:'Text', label:'Known Allergies',
                    placeholder:'Penicillin, Peanuts, or None', validation:{ maxLength:200 } }]}
            ]},
            { key:'m_conditions', type:'Checkbox', label:'Current / Past Conditions (tick all that apply)', options:[
                {label:'🩺 Diabetes (Type 1 or 2)', value:'diabetes'},
                {label:'❤️ Hypertension / High Blood Pressure', value:'hypertension'},
                {label:'🫀 Heart Disease', value:'heart'},
                {label:'🫁 Asthma / Respiratory', value:'asthma'},
                {label:'🧠 Depression / Anxiety', value:'mental'},
                {label:'🦴 Osteoporosis / Joint Issues', value:'bone'},
                {label:'✅ None of the above', value:'none'}
            ]},
            /* Insulin — chỉ hiện nếu chọn diabetes (showIf) */
            { key:'m_insulin', type:'Radio', label:'Do you take insulin?',
              showIf:{ operator:'And', conditions:[{ fieldKey:'m_conditions', operator:'Contains', value:'diabetes' }]},
              options:[{label:'Yes, injections', value:'yes'},{label:'No', value:'no'},{label:'Oral medication only', value:'oral'}] },
            /* Huyết áp — hiện nếu hypertension */
            { key:'m_bp_reading', type:'Text', label:'Latest Blood Pressure Reading',
              placeholder:'120/80 mmHg',
              showIf:{ operator:'And', conditions:[{ fieldKey:'m_conditions', operator:'Contains', value:'hypertension' }]},
              validation:{ pattern:'^\\d{2,3}/\\d{2,3}(\\s*mmHg)?$', customMessage:'Format: 120/80 or 120/80 mmHg' } },
            { key:'m_medications', type:'Textarea', label:'Current Medications',
              placeholder:'List all medications with dosage, e.g. Metformin 500mg twice daily',
              validation:{ maxLength:1000 } },
            { key:'m_surgeries', type:'Textarea', label:'Previous Surgeries',
              placeholder:'Describe past surgeries with approximate year',
              validation:{ maxLength:500 } },

            /* ── BƯỚC 3: Bảo hiểm & Liên lạc khẩn ── */
            { key:'ms3', type:'Section', label:'Insurance & Emergency Contact', properties:{pageBreak:true} },
            { key:'m_has_insurance', type:'Radio', label:'Do you have health insurance?', required:true,
              options:[{label:'Yes', value:'yes'},{label:'No', value:'no'}] },
            /* Chi tiết bảo hiểm — hiện khi có (showIf) */
            { key:'m_ins_provider', type:'Text', label:'Insurance Provider',
              placeholder:'Bao Viet, AIA, Prudential...',
              showIf:{ operator:'And', conditions:[{ fieldKey:'m_has_insurance', operator:'Equals', value:'yes' }]} },
            { key:'m_ins_number', type:'Text', label:'Policy / Card Number',
              placeholder:'XXXXXXXXXXXXX',
              showIf:{ operator:'And', conditions:[{ fieldKey:'m_has_insurance', operator:'Equals', value:'yes' }]},
              validation:{ minLength:8, maxLength:20 } },
            { key:'m_ins_group', type:'Text', label:'Group / Employer (if via employer)',
              placeholder:'Company Health Plan',
              showIf:{ operator:'And', conditions:[{ fieldKey:'m_has_insurance', operator:'Equals', value:'yes' }]} },
            { key:'mrow_emerg', type:'Row', columns:[
                { span:4, fields:[{ key:'m_ec_name', type:'Text', label:'Emergency Contact Name', required:true }]},
                { span:4, fields:[{ key:'m_ec_phone', type:'Phone', label:'Emergency Phone', required:true }]},
                { span:4, fields:[{ key:'m_ec_rel', type:'Select', label:'Relationship', required:true, options:[
                    {label:'Spouse', value:'spouse'},{label:'Parent', value:'parent'},
                    {label:'Child', value:'child'},{label:'Sibling', value:'sibling'},{label:'Friend', value:'friend'}
                ]}]}
            ]},
            { key:'m_reason', type:'Textarea', label:'Reason for Visit / Chief Complaint', required:true,
              placeholder:"Describe your main symptoms or reason for today's visit...",
              validation:{ minLength:10, maxLength:500, customMessage:'Please describe symptoms (at least 10 chars)' } },
            { key:'m_consent', type:'Checkbox', label:'Patient Consent', required:true, options:[
                {label:'I authorize treatment as medically necessary', value:'treatment'},
                {label:'I confirm all information provided is accurate', value:'accurate'},
                {label:'I accept the privacy and data policy', value:'privacy'}
            ]}
        ],
        settings: {
            multiPage: true,
            rules: [
                /* Rule 1 — Có bảo hiểm → bắt buộc điền thông tin */
                mkRule('rule_med_ins','Require insurance details when insured',1,
                    'm_has_insurance','eq','yes',
                    [
                        act('i1','require','m_ins_provider'),
                        act('i2','require','m_ins_number')
                    ],
                    [
                        act('i3','optional','m_ins_provider'),
                        act('i4','optional','m_ins_number')
                    ]
                ),
                /* Rule 2 — Bệnh tiểu đường → bắt buộc trả lời insulin */
                mkRule('rule_diabetes','Require insulin info for diabetic patients',2,
                    'm_conditions','contains','diabetes',
                    [ act('d1','require','m_insulin') ],
                    [ act('d2','optional','m_insulin') ]
                )
            ]
        },
        customHtml:'', customCss:''
    };

    /* ==========================================================
       TEMPLATE 3: EVENT REGISTRATION
       3 bước · VIP extras · workshop selection · dietary · online-only skip
       ========================================================== */
    var eventReg: any = {
        title: 'Event Registration — TechConf 2025',
        description: 'Register for our annual tech conference · VIP, Workshop & Online options',
        submitButtonText: '🎟️ Confirm Registration',
        category: 'events', icon: '🎟️',
        fields: [
            /* ── BƯỚC 1: Người tham dự ── */
            { key:'es1', type:'Section', label:'Attendee Information', properties:{pageBreak:false} },
            { key:'erow_name', type:'Row', columns:[
                { span:6, fields:[{ key:'e_first', type:'Text', label:'First Name', required:true, placeholder:'Alex',
                    validation:{ minLength:2, maxLength:50 } }]},
                { span:6, fields:[{ key:'e_last', type:'Text', label:'Last Name', required:true, placeholder:'Nguyen',
                    validation:{ minLength:2, maxLength:50 } }]}
            ]},
            { key:'erow_info', type:'Row', columns:[
                { span:6, fields:[{ key:'e_email', type:'Email', label:'Email Address', required:true, placeholder:'alex@company.com',
                    validation:{ pattern:'^[^@]+@[^@]+\\.[^@]+$', customMessage:'Ticket will be sent to this email' } }]},
                { span:6, fields:[{ key:'e_phone', type:'Phone', label:'Phone', placeholder:'+84 900 000 000' }]}
            ]},
            { key:'erow_org', type:'Row', columns:[
                { span:6, fields:[{ key:'e_company', type:'Text', label:'Company', placeholder:'Tech Startup Inc.',
                    validation:{ maxLength:100 } }]},
                { span:6, fields:[{ key:'e_job', type:'Text', label:'Job Title', placeholder:'CTO, Lead Developer...',
                    validation:{ maxLength:80 } }]}
            ]},

            /* ── BƯỚC 2: Loại vé & Session ── */
            { key:'es2', type:'Section', label:'Ticket & Sessions', properties:{pageBreak:true} },
            { key:'e_ticket', type:'Radio', label:'Select Your Ticket', required:true, options:[
                {label:'🎫 General Admission — FREE · Full day access', value:'general'},
                {label:'⭐ VIP Pass — $199 · Priority seating + networking dinner', value:'vip'},
                {label:'🛠️ Workshop Bundle — $149 · Morning workshops + sessions', value:'workshop'},
                {label:'💻 Online Only — FREE · Live stream access', value:'online'}
            ]},

            /* === VIP Extras — chỉ hiện khi chọn VIP === */
            { key:'e_vip_divider', type:'Html', label:'',
              showIf:{ operator:'And', conditions:[{ fieldKey:'e_ticket', operator:'Equals', value:'vip' }]},
              htmlContent:'<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px;margin:8px 0"><b style="color:#92400e">⭐ VIP Extras</b> — The fields below apply to your VIP package</div>' },
            { key:'e_vip_meal', type:'Select', label:'Networking Dinner — Meal Preference',
              showIf:{ operator:'And', conditions:[{ fieldKey:'e_ticket', operator:'Equals', value:'vip' }]},
              options:[
                {label:'Standard (meat included)', value:'standard'},{label:'Vegetarian', value:'veg'},
                {label:'Vegan', value:'vegan'},{label:'Gluten-free', value:'gf'},{label:'Halal', value:'halal'}
            ]},
            { key:'e_vip_hotel', type:'Radio', label:'Airport/Hotel Transfer Service (+$30)',
              showIf:{ operator:'And', conditions:[{ fieldKey:'e_ticket', operator:'Equals', value:'vip' }]},
              options:[{label:'Yes, I need transfer', value:'yes'},{label:'No, own transport', value:'no'}] },
            { key:'e_hotel_pickup', type:'Text', label:'Pick-up Address / Hotel Name',
              placeholder:'Sheraton Saigon, 88 Dong Khoi St',
              showIf:{ operator:'And', conditions:[{ fieldKey:'e_vip_hotel', operator:'Equals', value:'yes' }]} },

            /* === Workshop selection — chỉ hiện khi chọn Workshop === */
            { key:'e_workshops', type:'Checkbox', label:'Choose Morning Workshops (max 2)',
              showIf:{ operator:'And', conditions:[{ fieldKey:'e_ticket', operator:'Equals', value:'workshop' }]},
              options:[
                {label:'WS-1: Building AI-powered APIs with Python', value:'ws_ai'},
                {label:'WS-2: React 19 & Server Components Deep Dive', value:'ws_react'},
                {label:'WS-3: DevOps — CI/CD with GitHub Actions', value:'ws_devops'},
                {label:'WS-4: UX Research & Prototyping in Figma', value:'ws_ux'}
            ]},

            /* === Online notice — chỉ hiện khi Online === */
            { key:'e_stream_note', type:'Html', label:'',
              showIf:{ operator:'And', conditions:[{ fieldKey:'e_ticket', operator:'Equals', value:'online' }]},
              htmlContent:'<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:10px;padding:16px"><b style="color:#1d4ed8">📺 Online Attendee Info</b><p style="margin:8px 0 0;color:#1e40af">Stream link will be emailed 24h before the event. Recordings available for 30 days after.</p></div>' },

            /* Sessions — hiện cho General, VIP, Workshop (ẩn Online qua Rule) */
            { key:'e_sessions', type:'Checkbox', label:'Afternoon Sessions (select all you plan to attend)', options:[
                {label:'🎤 Keynote: The Future of Software Engineering', value:'keynote'},
                {label:'🤖 AI & Machine Learning in Production', value:'ai_ml'},
                {label:'☁️ Cloud Architecture at Scale', value:'cloud'},
                {label:'🔐 Cybersecurity Best Practices 2025', value:'security'},
                {label:'🚀 Startup Pitch Competition', value:'pitch'},
                {label:'🤝 Open Networking Session', value:'networking'}
            ]},

            /* ── BƯỚC 3: Tuỳ chọn & Xác nhận ── */
            { key:'es3', type:'Section', label:'Preferences & Confirmation', properties:{pageBreak:true} },
            { key:'e_dietary', type:'Select', label:'Dietary Requirement (conference lunch)', options:[
                {label:'No restriction', value:'none'},{label:'Vegetarian', value:'veg'},
                {label:'Vegan', value:'vegan'},{label:'Gluten-Free', value:'gf'},
                {label:'Halal', value:'halal'},{label:'Kosher', value:'kosher'},
                {label:'Other (specify below)', value:'other'}
            ]},
            { key:'e_dietary_note', type:'Text', label:'Other Dietary Details',
              placeholder:'Please specify...',
              showIf:{ operator:'And', conditions:[{ fieldKey:'e_dietary', operator:'Equals', value:'other' }]},
              validation:{ maxLength:200 } },
            { key:'e_accessibility', type:'Checkbox', label:'Accessibility Needs', options:[
                {label:'Wheelchair accessible seating', value:'wheelchair'},
                {label:'Sign language interpreter', value:'sign_lang'},
                {label:'Large-print materials', value:'large_print'},
                {label:'No special requirements', value:'none'}
            ]},
            { key:'e_tshirt', type:'Select', label:'T-Shirt Size (complimentary for in-person attendees)', options:[
                {label:'XS', value:'xs'},{label:'S', value:'s'},{label:'M', value:'m'},
                {label:'L', value:'l'},{label:'XL', value:'xl'},{label:'XXL', value:'xxl'}
            ]},
            { key:'e_newsletter', type:'Checkbox', label:'Stay Connected', options:[
                {label:'Send me recordings and future event announcements', value:'yes'}
            ]},
            { key:'e_terms', type:'Checkbox', label:'Terms & Conditions', required:true, options:[
                {label:'I confirm my registration details are correct', value:'confirm'},
                {label:'I accept the cancellation policy (no refunds within 48h)', value:'refund'}
            ]}
        ],
        settings: {
            multiPage: true,
            rules: [
                /* Rule 1 — VIP → require meal preference */
                mkRule('rule_vip','VIP: require meal pref + show transfer',1,
                    'e_ticket','eq','vip',
                    [
                        act('v1','require','e_vip_meal'),
                        act('v2','show','e_vip_divider'),
                        act('v3','show','e_sessions'),
                        act('v4','show','e_tshirt'),
                        act('v5','show','e_dietary')
                    ],
                    [
                        act('v6','optional','e_vip_meal')
                    ]
                ),
                /* Rule 2 — Workshop → require workshop selection */
                mkRule('rule_workshop','Workshop: require workshop selection',2,
                    'e_ticket','eq','workshop',
                    [
                        act('w1','require','e_workshops'),
                        act('w2','show','e_sessions'),
                        act('w3','show','e_tshirt'),
                        act('w4','show','e_dietary')
                    ],
                    [
                        act('w5','optional','e_workshops')
                    ]
                ),
                /* Rule 3 — Online → ẩn in-person fields, hiện stream note */
                mkRule('rule_online','Online ticket: hide in-person fields',3,
                    'e_ticket','eq','online',
                    [
                        act('o1','show','e_stream_note'),
                        act('o2','hide','e_sessions'),
                        act('o3','hide','e_tshirt'),
                        act('o4','hide','e_dietary'),
                        act('o5','hide','e_vip_divider'),
                        act('o6','hide','e_vip_meal'),
                        act('o7','hide','e_vip_hotel'),
                        act('o8','hide','e_hotel_pickup'),
                        act('o9','hide','e_workshops')
                    ],
                    [
                        act('o10','hide','e_stream_note'),
                        act('o11','show','e_sessions'),
                        act('o12','show','e_tshirt'),
                        act('o13','show','e_dietary')
                    ]
                )
            ]
        },
        customHtml:'', customCss:''
    };


    function formShellTemplate(kind: string): any {
        var map: Record<string, any> = {
            'executive-brief': {
                title: 'Executive Brief Form',
                description: 'A polished lead capture form with a premium consulting feel',
                submitButtonText: 'Request Consultation',
                category: 'general',
                icon: '🧭',
                fields: [
                    { key:'row_name', type:'Row', columns:[
                        { span:6, fields:[{ key:'first_name', type:'Text', label:'First Name', required:true, placeholder:'Olivia' }]},
                        { span:6, fields:[{ key:'last_name', type:'Text', label:'Last Name', required:true, placeholder:'Carter' }]}
                    ]},
                    { key:'row_contact', type:'Row', columns:[
                        { span:6, fields:[{ key:'email', type:'Email', label:'Work Email', required:true, placeholder:'name@company.com' }]},
                        { span:6, fields:[{ key:'phone', type:'Phone', label:'Phone', placeholder:'+84 901 234 567' }]}
                    ]},
                    { key:'company', type:'Text', label:'Company', placeholder:'Your company' },
                    { key:'service', type:'Select', label:'Area of Interest', required:true, options:[
                        { label:'Growth Strategy', value:'growth' },
                        { label:'Digital Transformation', value:'digital' },
                        { label:'Operations', value:'ops' },
                        { label:'Leadership Advisory', value:'leadership' }
                    ]},
                    { key:'message', type:'Textarea', label:'What would you like help with?', required:true, placeholder:'Tell us about your goals...', properties:{ rows:5 } }
                ],
                settings: {},
                customHtml: `<div class="mfp mfp-executive"><div class="mfp-shell"><div class="mfp-hero"><div class="mfp-kicker">STRATEGIC INTAKE</div><h1>{{form:title}}</h1><p>{{form:description}}</p></div><div class="mfp-content"><div class="mfp-grid">{{field:first_name}}{{field:last_name}}{{field:email}}{{field:phone}}</div><div class="mfp-stack">{{field:company}}{{field:service}}{{field:message}}</div><div class="mfp-actions"><button type="submit">{{form:submit}}</button></div></div></div></div>`,
                customCss: `.mfp.mfp-executive,.mfp.mfp-executive *,.mfp.mfp-executive *:before,.mfp.mfp-executive *:after{box-sizing:border-box}.mfp.mfp-executive{max-width:880px;margin:0 auto;padding:24px}.mfp-executive .mfp-shell{background:linear-gradient(180deg,#f8fafc,#fff);border:1px solid #e2e8f0;border-radius:28px;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.08)}.mfp-executive .mfp-hero{padding:36px 40px 28px;background:radial-gradient(circle at top right,rgba(99,102,241,.18),transparent 35%),linear-gradient(135deg,#0f172a,#1e293b);color:#fff}.mfp-executive .mfp-kicker{font-size:11px;letter-spacing:.2em;font-weight:700;opacity:.75;margin-bottom:10px}.mfp-executive h1,.mfp-executive p{margin:0}.mfp-executive h1{font-size:34px;line-height:1.1;margin-bottom:10px}.mfp-executive p{max-width:620px;color:rgba(255,255,255,.8);font-size:15px;line-height:1.7}.mfp-executive .mfp-content{padding:32px 40px 40px}.mfp-executive .mfp-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.mfp-executive .mfp-stack>*{margin-top:18px}.mfp-executive .mf-field{margin:0}.mfp-executive .mf-field-label{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#334155;margin:0 0 8px}.mfp-executive input,.mfp-executive textarea,.mfp-executive select{width:100%;font:inherit;background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:14px 16px;box-shadow:none;transition:border-color .18s,box-shadow .18s}.mfp-executive input:focus,.mfp-executive textarea:focus,.mfp-executive select:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 4px rgba(99,102,241,.14)}.mfp-executive .mf-field-error{font-size:12px;margin-top:6px;color:#dc2626}.mfp-executive .mfp-actions{padding-top:22px}.mfp-executive button[type=submit]{appearance:none;border:0;border-radius:999px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:14px 24px;font:inherit;font-weight:700;cursor:pointer;box-shadow:0 14px 30px rgba(99,102,241,.24)}@media (max-width:600px){.mfp.mfp-executive{padding:12px}.mfp-executive .mfp-grid{grid-template-columns:1fr}.mfp-executive .mfp-hero,.mfp-executive .mfp-content{padding:22px}}`
            },
            'editorial-application': {
                title: 'Job Application',
                description: 'Apply for this position',
                submitButtonText: 'Submit Application',
                category: 'hr',
                icon: '🖋️',
                fields: [
                    { key:'full_name', type:'Text', label:'Full Name', required:true, placeholder:'Your full name' },
                    { key:'row_contact', type:'Row', columns:[
                        { span:6, fields:[{ key:'email', type:'Email', label:'Email', required:true, placeholder:'you@example.com' }]},
                        { span:6, fields:[{ key:'phone', type:'Phone', label:'Phone', placeholder:'Phone number' }]}
                    ]},
                    { key:'address', type:'Text', label:'Address', placeholder:'City, State, Country' },
                    { key:'linkedin', type:'Url', label:'LinkedIn', placeholder:'https://linkedin.com/in/...' },
                    { key:'portfolio', type:'Url', label:'Portfolio', placeholder:'https://portfolio.example.com' },
                    { key:'cover_letter', type:'Textarea', label:'Cover Letter', required:true, placeholder:'Tell us why you are a great fit...', properties:{ rows:6 } }
                ],
                settings: {},
                customHtml: `<div class="mfp mfp-editorial"><div class="mfp-paper"><div class="mfp-head"><h1>{{form:title}}</h1><p>{{form:description}}</p></div><div class="mfp-divider"></div><div class="mfp-body"><div class="mfp-section-label">Personal Information</div>{{field:full_name}}<div class="mfp-grid">{{field:email}}{{field:phone}}</div>{{field:address}}{{field:linkedin}}{{field:portfolio}}{{field:cover_letter}}<div class="mfp-actions"><button type="submit">{{form:submit}}</button></div></div></div></div>`,
                customCss: `.mfp.mfp-editorial,.mfp.mfp-editorial *,.mfp.mfp-editorial *:before,.mfp.mfp-editorial *:after{box-sizing:border-box}.mfp.mfp-editorial{max-width:860px;margin:0 auto;padding:28px;background:#f8fafc}.mfp-editorial .mfp-paper{background:#fff;border:1px solid #dbe4ea;padding:40px 52px;box-shadow:0 24px 60px rgba(15,23,42,.08)}.mfp-editorial .mfp-head h1,.mfp-editorial .mfp-head p{margin:0}.mfp-editorial .mfp-head h1{font-family:Georgia,'Times New Roman',serif;font-size:54px;line-height:1.02;color:#111827}.mfp-editorial .mfp-head p{margin-top:12px;font-size:18px;color:#64748b;font-style:italic}.mfp-editorial .mfp-divider{height:2px;background:#111827;margin:26px 0 34px}.mfp-editorial .mfp-section-label{font-size:11px;letter-spacing:.22em;text-transform:uppercase;font-weight:700;color:#64748b;margin-bottom:18px}.mfp-editorial .mfp-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.mfp-editorial .mfp-body>*+*{margin-top:18px}.mfp-editorial .mf-field-label{display:block;margin:0 0 8px;font-weight:700;color:#111827}.mfp-editorial input,.mfp-editorial textarea,.mfp-editorial select{width:100%;font:inherit;border:1px solid #b8c0cc;border-radius:0;background:#fff;padding:12px 14px;transition:border-color .18s,box-shadow .18s}.mfp-editorial input:focus,.mfp-editorial textarea:focus,.mfp-editorial select:focus{outline:none;border-color:#111827;box-shadow:0 0 0 3px rgba(17,24,39,.08)}.mfp-editorial .mfp-actions{padding-top:10px}.mfp-editorial button[type=submit]{border:1px solid #111827;background:#111827;color:#fff;padding:13px 18px;border-radius:999px;font:inherit;font-weight:700;cursor:pointer}.mfp-editorial .mf-field-error{font-size:12px;color:#b91c1c;margin-top:6px}@media (max-width:600px){.mfp.mfp-editorial{padding:12px}.mfp-editorial .mfp-paper{padding:22px}.mfp-editorial .mfp-head h1{font-size:38px}.mfp-editorial .mfp-grid{grid-template-columns:1fr}}`
            },
            'wellness-intake': {
                title: 'Patient Intake Form',
                description: 'Complete before your appointment',
                submitButtonText: 'Save Intake Form',
                category: 'healthcare',
                icon: '🌿',
                fields: [
                    { key:'row_name', type:'Row', columns:[
                        { span:6, fields:[{ key:'first_name', type:'Text', label:'First Name', required:true, placeholder:'First name' }]},
                        { span:6, fields:[{ key:'last_name', type:'Text', label:'Last Name', required:true, placeholder:'Last name' }]}
                    ]},
                    { key:'row_meta', type:'Row', columns:[
                        { span:6, fields:[{ key:'dob', type:'Date', label:'Date of Birth', required:true }]},
                        { span:6, fields:[{ key:'phone', type:'Phone', label:'Phone', required:true, placeholder:'Contact number' }]}
                    ]},
                    { key:'email', type:'Email', label:'Email', placeholder:'patient@email.com' },
                    { key:'allergies', type:'Textarea', label:'Allergies / Sensitivities', placeholder:'List any allergies or sensitivities...', properties:{ rows:4 } },
                    { key:'visit_reason', type:'Textarea', label:'Reason for Visit', required:true, placeholder:'Tell us about your concerns...', properties:{ rows:5 } }
                ],
                settings: {},
                customHtml: `<div class="mfp mfp-wellness"><div class="mfp-card"><div class="mfp-banner"><div class="mfp-chip">CONFIDENTIAL</div><h1>{{form:title}}</h1><p>{{form:description}}</p></div><div class="mfp-main"><div class="mfp-grid">{{field:first_name}}{{field:last_name}}{{field:dob}}{{field:phone}}</div><div class="mfp-stack">{{field:email}}{{field:allergies}}{{field:visit_reason}}</div><div class="mfp-actions"><button type="submit">{{form:submit}}</button></div></div></div></div>`,
                customCss: `.mfp.mfp-wellness,.mfp.mfp-wellness *,.mfp.mfp-wellness *:before,.mfp.mfp-wellness *:after{box-sizing:border-box}.mfp.mfp-wellness{max-width:860px;margin:0 auto;padding:20px}.mfp-wellness .mfp-card{background:#fff;border:1px solid #d7efe4;border-radius:30px;overflow:hidden;box-shadow:0 24px 60px rgba(22,101,52,.08)}.mfp-wellness .mfp-banner{padding:34px 36px;background:linear-gradient(135deg,#ecfdf5,#d1fae5 58%,#eff6ff);border-bottom:1px solid #d7efe4}.mfp-wellness .mfp-chip{display:inline-flex;padding:7px 10px;border-radius:999px;background:#fff;color:#065f46;font-size:11px;font-weight:800;letter-spacing:.14em;margin-bottom:14px}.mfp-wellness h1,.mfp-wellness p{margin:0}.mfp-wellness h1{font-size:34px;color:#064e3b;margin-bottom:8px}.mfp-wellness p{color:#4b5563;line-height:1.7}.mfp-wellness .mfp-main{padding:30px 36px 38px}.mfp-wellness .mfp-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.mfp-wellness .mfp-stack>*{margin-top:16px}.mfp-wellness .mf-field-label{display:block;margin:0 0 8px;font-size:13px;font-weight:700;color:#065f46}.mfp-wellness input,.mfp-wellness textarea,.mfp-wellness select{width:100%;font:inherit;background:#f8fffb;border:1px solid #b7e4cf;border-radius:16px;padding:13px 15px;transition:border-color .18s,box-shadow .18s}.mfp-wellness input:focus,.mfp-wellness textarea:focus,.mfp-wellness select:focus{outline:none;border-color:#10b981;box-shadow:0 0 0 4px rgba(16,185,129,.14)}.mfp-wellness .mfp-actions{padding-top:20px}.mfp-wellness button[type=submit]{border:0;border-radius:16px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;padding:14px 18px;font:inherit;font-weight:700;cursor:pointer;min-width:220px}.mfp-wellness .mf-field-error{font-size:12px;color:#b91c1c;margin-top:6px}@media (max-width:600px){.mfp.mfp-wellness{padding:12px}.mfp-wellness .mfp-grid{grid-template-columns:1fr}.mfp-wellness .mfp-banner,.mfp-wellness .mfp-main{padding:22px}}`
            },
            'summit-registration': {
                title: 'Summit Registration',
                description: 'Reserve your seat for the event experience',
                submitButtonText: 'Complete Registration',
                category: 'events',
                icon: '🎫',
                fields: [
                    { key:'row_name', type:'Row', columns:[
                        { span:6, fields:[{ key:'first_name', type:'Text', label:'First Name', required:true, placeholder:'First name' }]},
                        { span:6, fields:[{ key:'last_name', type:'Text', label:'Last Name', required:true, placeholder:'Last name' }]}
                    ]},
                    { key:'row_contact', type:'Row', columns:[
                        { span:6, fields:[{ key:'email', type:'Email', label:'Email', required:true, placeholder:'you@company.com' }]},
                        { span:6, fields:[{ key:'company', type:'Text', label:'Company', placeholder:'Company name' }]}
                    ]},
                    { key:'ticket', type:'Radio', label:'Ticket', required:true, options:[
                        { label:'General', value:'general' },
                        { label:'VIP', value:'vip' },
                        { label:'Workshop Pass', value:'workshop' }
                    ]},
                    { key:'sessions', type:'Checkbox', label:'Sessions', options:[
                        { label:'Opening keynote', value:'keynote' },
                        { label:'Growth workshop', value:'growth' },
                        { label:'Product panel', value:'product' }
                    ]},
                    { key:'notes', type:'Textarea', label:'Notes', placeholder:'Accessibility, dietary, or special requests...', properties:{ rows:4 } }
                ],
                settings: {},
                customHtml: `<div class="mfp mfp-summit"><div class="mfp-frame"><div class="mfp-side"><div class="mfp-side-inner"><div class="mfp-badge">LIVE EVENT</div><h1>{{form:title}}</h1><p>{{form:description}}</p></div></div><div class="mfp-form-pane"><div class="mfp-grid">{{field:first_name}}{{field:last_name}}{{field:email}}{{field:company}}</div><div class="mfp-stack">{{field:ticket}}{{field:sessions}}{{field:notes}}</div><div class="mfp-actions"><button type="submit">{{form:submit}}</button></div></div></div></div>`,
                customCss: `.mfp.mfp-summit,.mfp.mfp-summit *,.mfp.mfp-summit *:before,.mfp.mfp-summit *:after{box-sizing:border-box}.mfp.mfp-summit{max-width:980px;margin:0 auto;padding:20px}.mfp-summit .mfp-frame{display:grid;grid-template-columns:320px 1fr;background:#fff;border:1px solid #dbeafe;border-radius:28px;overflow:hidden;box-shadow:0 24px 60px rgba(30,41,59,.1)}.mfp-summit .mfp-side{background:linear-gradient(180deg,#0f172a,#1d4ed8);color:#fff;min-height:100%}.mfp-summit .mfp-side-inner{padding:34px 28px}.mfp-summit .mfp-badge{display:inline-flex;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,.12);font-size:11px;font-weight:800;letter-spacing:.16em;margin-bottom:16px}.mfp-summit h1,.mfp-summit p{margin:0}.mfp-summit h1{font-size:34px;line-height:1.05;margin-bottom:10px}.mfp-summit p{color:rgba(255,255,255,.8);line-height:1.7}.mfp-summit .mfp-form-pane{padding:30px 34px 36px;background:linear-gradient(180deg,#fff,#f8fbff)}.mfp-summit .mfp-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.mfp-summit .mfp-stack>*{margin-top:16px}.mfp-summit .mf-field-label{display:block;margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#334155}.mfp-summit input,.mfp-summit textarea,.mfp-summit select{width:100%;font:inherit;background:#fff;border:1px solid #bfdbfe;border-radius:16px;padding:13px 15px;transition:border-color .18s,box-shadow .18s}.mfp-summit input:focus,.mfp-summit textarea:focus,.mfp-summit select:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.13)}.mfp-summit button[type=submit]{border:0;border-radius:16px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;padding:14px 18px;font:inherit;font-weight:700;cursor:pointer;min-width:220px}.mfp-summit .mfp-actions{padding-top:20px}.mfp-summit .mf-field-error{font-size:12px;color:#b91c1c;margin-top:6px}@media (max-width:600px){.mfp.mfp-summit{padding:12px}.mfp-summit .mfp-frame{grid-template-columns:1fr}.mfp-summit .mfp-grid{grid-template-columns:1fr}.mfp-summit .mfp-side-inner,.mfp-summit .mfp-form-pane{padding:22px}}`
            }
        };
        return map[kind];
    }

    var customPresets: Record<string, any> = {
        'blank': blank,
        'corporate-contact':    {},
        'patient-intake':       {},
        'tech-job-application': {},
        'golf-scorecard':       golfScorecard,
    };
    CONFIG_TEMPLATES.forEach(function (tpl: any) {
        if (!tpl || !tpl.id) return;
        if (tpl.id === 'blank') return;
        customPresets[tpl.id] = Object.assign({}, customPresets[tpl.id] || {}, tpl, {
            settings: Object.assign({}, (customPresets[tpl.id] && customPresets[tpl.id].settings) || {}, tpl.settings || {}, {
                rules: tpl.rules || ((customPresets[tpl.id] && customPresets[tpl.id].settings && customPresets[tpl.id].settings.rules) || []),
                workflowTemplate: tpl.workflow || ((customPresets[tpl.id] && customPresets[tpl.id].settings && customPresets[tpl.id].settings.workflowTemplate) || null)
            })
        });
    });
    /* ── Registry ────────────────────────────────────────── */
    var presets: Record<string, any> = customPresets;

    /* ── SQL setup modal (badge: TplSetupSql v20260429-01) ── */
    var TPL_SETUP_BADGE = 'TplSetupSql v20260429-01';
    function escTplHtml(s: any): string {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function showSqlSetupModal(sql: string, title: string): void {
        var existing = document.getElementById('mf-tpl-setup-modal');
        if (existing) existing.remove();
        var ov = document.createElement('div');
        ov.id = 'mf-tpl-setup-modal';
        ov.setAttribute('data-mf-tpl-setup-badge', TPL_SETUP_BADGE);
        ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:24px';
        var card = document.createElement('div');
        card.style.cssText = 'background:#fff;border-radius:14px;max-width:880px;width:100%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.3);overflow:hidden';
        card.innerHTML =
            '<div style="padding:18px 22px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">' +
              '<div><h3 style="margin:0;font-size:17px;color:#0f172a"><i class="fa fa-database" style="margin-right:8px;color:#2563eb"></i> Database Setup &mdash; ' + escTplHtml(title) + '</h3>' +
              '<p style="margin:6px 0 0;font-size:12px;color:#64748b">Run this SQL on your target database (e.g. <code>DashboardDatabase</code>) before testing the form. The script is idempotent &mdash; safe to re-run.</p></div>' +
              '<button type="button" id="mf-tpl-setup-close" style="background:none;border:0;font-size:22px;cursor:pointer;color:#64748b;line-height:1">&times;</button>' +
            '</div>' +
            '<div style="flex:1;padding:14px 22px;overflow:auto">' +
              '<textarea id="mf-tpl-setup-sql" readonly spellcheck="false" style="width:100%;height:380px;font-family:Consolas,Menlo,monospace;font-size:12px;line-height:1.5;border:1px solid #cbd5e1;border-radius:8px;padding:12px;background:#f8fafc;color:#0f172a;white-space:pre;overflow:auto;resize:vertical"></textarea>' +
            '</div>' +
            '<div style="padding:14px 22px;border-top:1px solid #e2e8f0;display:flex;gap:10px;justify-content:flex-end;font-size:12px;color:#64748b;align-items:center">' +
              '<span style="margin-right:auto">Badge: ' + escTplHtml(TPL_SETUP_BADGE) + '</span>' +
              '<button type="button" id="mf-tpl-setup-copy" class="mf-builder-btn" style="background:#2563eb;color:#fff;border-color:#2563eb"><i class="fa fa-copy"></i> Copy SQL</button>' +
              '<button type="button" id="mf-tpl-setup-done" class="mf-builder-btn">Done</button>' +
            '</div>';
        ov.appendChild(card);
        document.body.appendChild(ov);
        (document.getElementById('mf-tpl-setup-sql') as HTMLTextAreaElement).value = sql;

        var close = function () { var n = document.getElementById('mf-tpl-setup-modal'); if (n) n.remove(); };
        (document.getElementById('mf-tpl-setup-close') as HTMLElement).addEventListener('click', close);
        (document.getElementById('mf-tpl-setup-done')  as HTMLElement).addEventListener('click', close);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        (document.getElementById('mf-tpl-setup-copy') as HTMLElement).addEventListener('click', function () {
            var ta = document.getElementById('mf-tpl-setup-sql') as HTMLTextAreaElement;
            ta.select();
            try { document.execCommand('copy'); } catch (_e) {}
            var nav: any = navigator;
            if (nav && nav.clipboard && nav.clipboard.writeText) { nav.clipboard.writeText(sql).catch(function(){}); }
            if (typeof (B as any).showToast === 'function') (B as any).showToast('SQL copied to clipboard', 'success');
        });
    }

    /* ── applyTemplate ───────────────────────────────────── */
    function applyTemplate(id: string) {
        var tpl = presets[id] || presets['blank'];
        var canonical = B.exportCanonicalSchema ? B.exportCanonicalSchema({
            version: '1.0',
            fields: (tpl && tpl.fields) || [],
            settings: Object.assign({}, (tpl && tpl.settings) || {}, {
                customHtml: (tpl && tpl.customHtml) || ((tpl && tpl.settings && tpl.settings.customHtml)) || '',
                customCss: (tpl && tpl.customCss) || ((tpl && tpl.settings && tpl.settings.customCss)) || '',
                rules: (tpl && tpl.rules) || ((tpl && tpl.settings && tpl.settings.rules)) || [],
                workflowTemplate: (tpl && tpl.workflow) || ((tpl && tpl.settings && tpl.settings.workflowTemplate)) || null
            })
        }) : { version: '1.0', fields: [], settings: {} };
        B.setVal(B.EL.canvasTitle,       tpl.title);
        B.setVal(B.EL.canvasDescription, tpl.description);
        B.setVal(B.EL.submitBtnText,     tpl.submitButtonText);
        B.state.schema = canonical;
        B.state.fieldCounter       = B.state.schema.fields.length;
        B.state.selectedFieldIndex = -1;
        B.state.isDirty            = true;
        // Apply theme from template definition
        if (B.state.schema.settings && B.state.schema.settings.theme) {
            if (typeof (window as any).MFSelectTheme === 'function') {
                (window as any).MFSelectTheme(B.state.schema.settings.theme);
            }
        }

        var htmlEd = document.getElementById('mf-custom-html-editor') as HTMLTextAreaElement|null;
        var cssEd  = document.getElementById('mf-custom-css-editor')  as HTMLTextAreaElement|null;
        if (htmlEd) htmlEd.value = (B.state.schema.settings && B.state.schema.settings.customHtml) || '';
        if (cssEd)  cssEd.value  = (B.state.schema.settings && B.state.schema.settings.customCss) || '';

        var mpToggle = document.getElementById('mf-setting-multi-page') as HTMLInputElement|null;
        if (mpToggle) mpToggle.checked = !!(B.state.schema.settings && B.state.schema.settings.multiPage);
        var mpHint = document.getElementById('mf-multipage-hint');
        if (mpHint) mpHint.style.display = (B.state.schema.settings && B.state.schema.settings.multiPage) ? '' : 'none';

        var doToggle = document.getElementById('mf-setting-display-only') as HTMLInputElement|null;
        if (doToggle) doToggle.checked = !!(B.state.schema.settings && B.state.schema.settings.displayOnly);

        B.callModule('canvas',     'render');
        // [PaletteRaceFix v20260506-05] After importing a template, the canvas
        // re-renders any field types it brought in (e.g. PdfForm). If the user
        // is on a brand-new form, plugin scripts may have registered AFTER the
        // initial palette pass — so we ask the canvas to refresh the palette
        // now so the user immediately sees the matching widget tile.
        try { B.callModule('canvas', 'refreshPalette'); } catch (_) { /* optional */ }
        B.callModule('properties', 'hideProps');
        if (B.callModule) {
            B.callModule('rule-builder-ui', 'refresh');
        }

        // Show SQL setup modal if template requires DB schema (badge: TplSetupSql v20260429-01)
        if (tpl && tpl.setupSql) {
            showSqlSetupModal(String(tpl.setupSql), tpl.title || 'Template');
        }
    }

    /* ── Export JSON ─────────────────────────────────────── */
    function exportForm() {
        var title   = B.getVal(B.EL.canvasTitle) || 'Untitled Form';
        var slug    = title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
        var payload = {
            templateVersion: '6.0',
            meta: { name:title, slug, exportedAt:new Date().toISOString(), fieldCount:B.state.schema.fields.length },
            form: { title, description:B.getVal(B.EL.canvasDescription)||'', submitButtonText:B.getVal(B.EL.submitBtnText)||'Submit' },
            fields:   B.state.schema.fields,
            settings: B.state.schema.settings || {}
        };
        var blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href = url; a.download = 'megaform-'+slug+'.json';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
        B.showToast('Form exported as JSON','success');
    }

    /* ── Import JSON ─────────────────────────────────────── */
    // [ImportFormGuard v20260504-12] Two new defensive checks here:
    //  (a) Detect when the imported JSON is a TEMPLATE FILE (root has fields/settings)
    //      that the user previously corrupted by pasting it into a single field's
    //      widgetProps. We unwrap automatically with a confirm, so the import works.
    //  (b) Detect when ANY imported field carries a template-shaped widgetProps
    //      (fields[]+version OR fields[]+settings) — those keys are stripped by
    //      core.ts createFieldFromTemplate, but we surface a clear toast so the
    //      admin knows their file is mis-shaped and can clean it.
    var IMPORT_FORM_GUARD_BADGE = 'ImportFormGuard v20260504-12';
    try { (window as any).__MF_IMPORT_FORM_GUARD_BADGE__ = IMPORT_FORM_GUARD_BADGE; } catch (_e) { }
    function importForm() {
        var input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.addEventListener('change', function(ev: Event) {
            var file = (ev.target as HTMLInputElement).files?.[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(e2: ProgressEvent<FileReader>) {
                try {
                    var data   = JSON.parse(e2.target!.result as string);
                    var fields = data.fields || (data.schema && data.schema.fields) || [];
                    if (!fields.length) { B.showToast('No fields found in file','error'); return; }

                    // [ImportFormGuard v20260504-12, check (a)] Auto-recover when the
                    // entire file content was previously dumped into a single field's
                    // widgetProps. The hallmark: ONE imported field whose widgetProps
                    // is itself shaped like a template root (has fields[]+settings/version).
                    if (fields.length === 1 && fields[0] && fields[0].widgetProps) {
                        var nested: any = fields[0].widgetProps;
                        if (Array.isArray(nested.fields) && nested.fields.length > 0
                            && (typeof nested.version === 'string' || (nested.settings && typeof nested.settings === 'object'))) {
                            var nestedFieldCount = nested.fields.length;
                            if (confirm('Detected a nested form template inside the only field\'s widgetProps ('
                                        + nestedFieldCount + ' fields, likely a previous paste-into-wrong-field corruption).\n\n'
                                        + 'Auto-recover by importing the inner template instead?')) {
                                fields = nested.fields;
                                if (nested.settings) data.settings = nested.settings;
                                if (nested.title) (data as any).form = Object.assign({}, (data as any).form || {}, { title: nested.title });
                                if (nested.description && !((data as any).form && (data as any).form.description)) {
                                    (data as any).form = Object.assign({}, (data as any).form || {}, { description: nested.description });
                                }
                            }
                        }
                    }

                    // [ImportFormGuard v20260504-12, check (b)] Warn (don't reject) if any
                    // remaining imported field still has template-shaped widgetProps.
                    // core.ts createFieldFromTemplate will sanitize them, but the user
                    // should know their file is mis-shaped.
                    var corruptedKeys: string[] = [];
                    for (var fi = 0; fi < fields.length; fi++) {
                        var fld: any = fields[fi];
                        var fwp: any = fld && fld.widgetProps;
                        if (fwp && typeof fwp === 'object'
                            && Array.isArray(fwp.fields)
                            && (typeof fwp.version === 'string' || (fwp.settings && typeof fwp.settings === 'object'))) {
                            corruptedKeys.push(String(fld.key || ('#' + fi)));
                        }
                    }
                    if (corruptedKeys.length > 0) {
                        B.showToast('Warning: '+corruptedKeys.length+' field(s) had template-shaped widgetProps and were sanitized: '+corruptedKeys.join(', '),'error');
                    }

                    if (B.state.schema.fields.length > 0 && !confirm('Import will replace current form. Continue?')) return;
                    var form = data.form || {};
                    B.setVal(B.EL.canvasTitle,       form.title       || data.meta?.name || 'Imported Form');
                    B.setVal(B.EL.canvasDescription, form.description || '');
                    B.setVal(B.EL.submitBtnText,     form.submitButtonText || 'Submit');
                    var settings = data.settings || (data.schema && data.schema.settings) || {};
                    B.state.schema = B.exportCanonicalSchema ? B.exportCanonicalSchema({ version: '1.0', fields: fields, settings: settings }) : { version: '1.0', fields: fields, settings: settings };
                    B.state.fieldCounter       = B.state.schema.fields.length;
                    B.state.selectedFieldIndex = -1;
                    B.state.isDirty            = true;
                    var htmlEd2 = document.getElementById('mf-custom-html-editor') as HTMLTextAreaElement|null;
                    var cssEd2  = document.getElementById('mf-custom-css-editor')  as HTMLTextAreaElement|null;
                    if (htmlEd2) htmlEd2.value = (B.state.schema.settings && B.state.schema.settings.customHtml)||'';
                    if (cssEd2)  cssEd2.value  = (B.state.schema.settings && B.state.schema.settings.customCss) ||'';
                    B.callModule('canvas',     'render');
                    B.callModule('properties', 'hideProps');
                    B.showToast('Imported '+B.state.schema.fields.length+' fields from "'+file.name+'"','success');
                } catch(err: any) { B.showToast('Invalid JSON: '+err.message,'error'); }
            };
            reader.readAsText(file);
        });
        input.click();
    }

    /* ── showChooser ─────────────────────────────────────── */
    function showChooser() {
        var gallery = document.getElementById(B.EL.templateGallery);
        var app     = document.getElementById(B.EL.builderApp);
        if (gallery) gallery.style.display = '';
        if (app)     app.style.display     = 'none';
    }

    B.registerModule('templates', {
        init: function(){},
        applyTemplate,
        getAllPresets: function() { return presets; },
        getPreset:    function(id: string) { return presets[id]; },
        exportForm, importForm, showChooser
    });

    (B as any).applyTemplate = applyTemplate;
    (B as any).exportForm    = exportForm;
    (B as any).importForm    = importForm;
    (B as any).showSqlSetupModal = showSqlSetupModal;
})();
