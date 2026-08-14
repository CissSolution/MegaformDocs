// Strip the repo-only / dev-harness passages out of the two published integration articles.
// A DNN site owner has no checkout, runs no node scripts, and cannot set environment variables on
// "the MegaForm host" - those instructions describe our test rig, not their site.
import fs from 'node:fs';

const SP = 'C:/Users/ADMINI~1/AppData/Local/Temp/claude/e--DNNDEFENDER-AND-AI-DESIGNES-AI-DESIGNES-MegaFormSolution-280-Oqtane-um/4e00ffee-bc7e-454b-ba30-0465cb4dffed/scratchpad';

const SEC78 = `<h2 id="7-calling-a-crm-that-is-on-your-own-network">7. Calling a CRM that is on your own network</h2>
<p>MegaForm refuses webhook URLs that resolve to loopback, private, link-local, carrier-grade-NAT or cloud-metadata addresses. That guard exists because the URL can contain <code>{{field.*}}</code> tokens filled in by an anonymous visitor, which would otherwise turn a public form into a probe of your internal network. A blocked call fails the node with:</p>
<pre><code>Blocked webhook URL: URL targets a blocked (private/loopback/metadata) address</code></pre>
<p>If the receiving system only answers on an internal address, give it a hostname your DNN server can resolve and reach — normally a reverse proxy or an internal DNS name in front of it — and point the node at that. What the guard inspects is the address the URL <em>resolves to</em>, so a public-looking hostname that resolves to an internal address is still refused.</p>
<p>Whether a server may call private addresses at all is a decision for whoever administers that server, not a per-form setting, and there is deliberately no switch for it in the form builder: a URL assembled from an untrusted field would then be able to reach anything the server can reach.</p>
<hr />
<h2 id="8-testing-before-you-trust-it">8. Testing before you trust it</h2>
<p>Point the node at a staging endpoint of the receiving system while you are still changing it, never at production. Two things to lean on before the first real submission:</p>
<ul>
<li><strong>Test</strong>, on the workflow canvas toolbar, runs the graph as a dry run and highlights the nodes it walked — enough to confirm the webhook is on the path and that your response routes branch where you meant them to, without submitting anything.</li>
<li><strong>Validate BPMN</strong> refuses to publish a node that cannot run: a webhook with no URL is reported as <em>"Webhook 'x': URL is required."</em></li>
</ul>
<p>Once a call does go out, the node's own error text is the first thing to read — §10 lists the ones that come up most.</p>
<hr />
`;

const SEC6 = `<h2 id="6-try-it-end-to-end">6. Try it end to end</h2>
<p>Use <strong>Test</strong> on the canvas toolbar first. It runs the graph as a dry run and highlights the nodes it walked, which is enough to confirm the API service task is on the path and that the response routes from §4 branch the way you meant.</p>
<p>Then submit the form for real and look for the record in the receiving system. If the reply carries an order number, read it back with <code>{{var.erpResult}}</code> and echo it in the confirmation message — an order number on screen is the quickest end-to-end proof that the task fired and the answer came home.</p>
<p>Keep the task pointed at a staging endpoint until you trust it. If your ERP only answers on an internal address, see <a href="/MegaFormDocsT?doc=int-webhook#7-calling-a-crm-that-is-on-your-own-network">Calling a CRM on your own network</a>.</p>
<hr />
`;

const cut = (body, startMark, endMark, replacement, label) => {
  const i = body.indexOf(startMark);
  const j = body.indexOf(endMark);
  if (i < 0) throw new Error(`${label}: start marker missing`);
  if (j < 0) throw new Error(`${label}: end marker missing`);
  if (j <= i) throw new Error(`${label}: end marker precedes start`);
  return body.slice(0, i) + replacement + body.slice(j);
};

const BAD = [
  ['node tools/', /node tools\//g],
  ['localhost:5199', /localhost:5199/g],
  ['MEGAFORM_ALLOW_PRIVATE_WEBHOOKS', /MEGAFORM_ALLOW_PRIVATE_WEBHOOKS/g],
  ['seed-integration-demos', /seed-integration-demos/g],
  ['mock-crm', /mock-crm/g],
  ['Nguyen Van A', /Nguyen Van A/g],
  ['ships with the repo', /ships with the repo/gi],
];

const updates = [];
for (const id of [465, 467]) {
  const dj = JSON.parse(fs.readFileSync(`${SP}/data${id}.json`, 'utf8'));
  const before = String(dj.body);
  let b = before;

  if (id === 465) {
    b = cut(b, '<h2 id="7-calling-a-crm-that-is-on-your-own-network">', '<h2 id="9-', SEC78, '465 §7-§8');
  } else {
    b = cut(b, '<h2 id="6-try-it-end-to-end">', '<h2 id="7-when-the-task-does-not-fire">', SEC6, '467 §6');
  }
  // Sample data keeps the English fictional name used by the demos and the GIFs.
  b = b.replace(/Nguyen Van A/g, 'Emily Carter');

  const left = BAD.map(([n, re]) => { const c = (b.match(re) || []).length; return c ? `${n}×${c}` : null; }).filter(Boolean);
  console.log(`${id}  body ${before.length} -> ${b.length}   leftovers: ${left.length ? left.join(' ') : 'none'}`);
  if (left.length) { console.error('REFUSING: repo-only content still present'); process.exit(1); }
  if (!/<img /.test(b)) { console.error(`REFUSING: ${id} lost its <img>`); process.exit(1); }
  const h2 = (b.match(/<h2 /g) || []).length;
  const h2before = (before.match(/<h2 /g) || []).length;
  if (h2 !== h2before) { console.error(`REFUSING: ${id} heading count changed ${h2before} -> ${h2}`); process.exit(1); }
  dj.body = b;
  updates.push({ submissionId: id, data: dj });
}
fs.writeFileSync(`${SP}/plan-derepo.json`, JSON.stringify({ updates }, null, 1));
console.log(`plan written: ${updates.length} updates, fields ${updates.map((u) => Object.keys(u.data).length).join('/')}`);
