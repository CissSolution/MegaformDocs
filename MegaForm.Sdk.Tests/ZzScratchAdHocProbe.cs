using System;
using System.Linq;
using MegaForm.Core.Workflow.Bpmn;
using Xunit;
using Xunit.Abstractions;

namespace MegaForm.Sdk.Tests
{
    public sealed class ZzScratchAdHocProbe
    {
        private readonly ITestOutputHelper _out;
        public ZzScratchAdHocProbe(ITestOutputHelper o) { _out = o; }

        private const string AdHoc = @"
<bpmn:definitions xmlns:bpmn='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <bpmn:process id='P' name='Sign-off'>
    <bpmn:startEvent id='s' />
    <bpmn:userTask id='t1' name='Collect data' />
    <bpmn:adHocSubProcess id='ah' name='Ad-hoc research phase' />
    <bpmn:userTask id='t2' name='FINAL SIGN-OFF (must not be skipped)' />
    <bpmn:endEvent id='e' />
    <bpmn:sequenceFlow id='f1' sourceRef='s' targetRef='t1' />
    <bpmn:sequenceFlow id='f2' sourceRef='t1' targetRef='ah' />
    <bpmn:sequenceFlow id='f3' sourceRef='ah' targetRef='t2' />
    <bpmn:sequenceFlow id='f4' sourceRef='t2' targetRef='e' />
  </bpmn:process>
</bpmn:definitions>";

        // Same shape but with a plain collapsed subProcess (which IS in FlowNodeNames).
        private const string PlainSub = @"
<bpmn:definitions xmlns:bpmn='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <bpmn:process id='P' name='Sign-off'>
    <bpmn:startEvent id='s' />
    <bpmn:userTask id='t1' name='Collect data' />
    <bpmn:subProcess id='ah' name='Research phase' />
    <bpmn:userTask id='t2' name='FINAL SIGN-OFF (must not be skipped)' />
    <bpmn:endEvent id='e' />
    <bpmn:sequenceFlow id='f1' sourceRef='s' targetRef='t1' />
    <bpmn:sequenceFlow id='f2' sourceRef='t1' targetRef='ah' />
    <bpmn:sequenceFlow id='f3' sourceRef='ah' targetRef='t2' />
    <bpmn:sequenceFlow id='f4' sourceRef='t2' targetRef='e' />
  </bpmn:process>
</bpmn:definitions>";

        private void Dump(string label, string xml, bool strict)
        {
            var r = new BpmnImporter().Import(xml, new BpmnImportOptions { Strict = strict });
            _out.WriteLine("=== " + label + " strict=" + strict);
            _out.WriteLine("Success=" + r.Success);
            _out.WriteLine("Errors=[" + string.Join(" | ", r.Errors) + "]");
            _out.WriteLine("Unsupported(" + r.UnsupportedElements.Count + ")=[" + string.Join(" | ", r.UnsupportedElements) + "]");
            _out.WriteLine("Warnings(" + r.Warnings.Count + "):");
            foreach (var w in r.Warnings) _out.WriteLine("   - [" + w.ElementType + "] " + w.Message);
            if (r.Definition != null)
            {
                _out.WriteLine("Start=" + r.Definition.StartNodeId);
                _out.WriteLine("Nodes=" + string.Join(", ",
                    r.Definition.Nodes.Select(n => n.Id + " " + n.Type + ":'" + n.Label + "'" + (n.IsDisabled ? "(disabled)" : ""))));
                _out.WriteLine("Edges=" + string.Join(", ",
                    r.Definition.Edges.Select(e => e.SourceNodeId + "->" + e.TargetNodeId + " [" + e.SourceHandle + "]")));
            }
            var resp = BpmnImportResponse.From(r, false);
            _out.WriteLine("RESPONSE Success=" + resp.Success + " Message=" + resp.Message);
            _out.WriteLine("");
        }

        [Fact]
        public void Probe()
        {
            Dump("adHocSubProcess", AdHoc, true);
            Dump("adHocSubProcess", AdHoc, false);
            Dump("plain subProcess", PlainSub, true);
            Dump("plain subProcess", PlainSub, false);
            Assert.True(true);
        }
    }
}
