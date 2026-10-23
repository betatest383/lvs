import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { jsPDF } from 'npm:jspdf@4.0.0';

const FRONT_OF_HOUSE_ID = '69c365db40745207258828cf';

const CRITICAL_RESPONSES = [
  'unsafe', 'failed', 'deficient', 'needs repair', 'water damage',
  'cracked', 'improper installation', 'immediate attention required'
];

function isCritical(val) {
  if (!val) return false;
  const v = String(val).toLowerCase().trim();
  return CRITICAL_RESPONSES.some(c => v === c || v.includes(c));
}

// SSRF guard: only allow HTTPS URLs to public hosts. Blocks cloud metadata
// endpoints (169.254.169.254), loopback/private/link-local IP literals,
// and non-https schemes so attacker-supplied photo URLs cannot target
// internal services from the server-side fetch below.
function isAllowedImageUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  // Block localhost and common metadata hostnames
  const blockedHosts = ['localhost', '169.254.169.254', 'metadata.google.internal', 'metadata', '169.254.170.2', '169.254.170.237'];
  if (blockedHosts.includes(host)) return false;
  // Block IP literals in private/loopback/link-local/zero ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1]), parseInt(ipv4[2])];
    if (a === 0) return false;                       // 0.0.0.0/8
    if (a === 10) return false;                      // 10.0.0.0/8
    if (a === 127) return false;                     // 127.0.0.0/8
    if (a === 169 && b === 254) return false;        // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
    if (a === 192 && b === 168) return false;       // 192.168.0.0/16
    if (a >= 224) return false;                     // multicast/reserved
  }
  // Block IPv6 loopback/link-local/unique-local
  if (host.includes(':')) {
    if (host === '::1' || host === '::') return false;
    if (host.startsWith('fe80') || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('::ffff:')) return false;
  }
  return true;
}

async function fetchImageAsBase64(url) {
  try {
    if (!isAllowedImageUrl(url)) {
      console.error('Blocked image fetch: URL failed SSRF validation');
      return null;
    }
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const arrayBuffer = await resp.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binaryStr = '';
    for (let i = 0; i < uint8.length; i++) {
      binaryStr += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binaryStr);
    
    // Detect MIME type
    if (uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4E && uint8[3] === 0x47) {
      return `data:image/png;base64,${base64}`;
    }
    if (uint8[0] === 0xFF && uint8[1] === 0xD8) {
      return `data:image/jpeg;base64,${base64}`;
    }
    return null;
  } catch(e) {
    console.error('Image fetch error:', e.message);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { report_id, job_id } = await req.json();

    let report = null;
    if (report_id) {
      report = await base44.entities.InspectionReport.get(report_id).catch(() => null);
    } else if (job_id) {
      const reports = await base44.asServiceRole.entities.InspectionReport.filter({ job_id }).catch(() => []);
      report = reports[0] || null;
    }

    if (!report) {
      return Response.json({
        error: 'Inspection report not found',
        details: { report_id: report_id || null, job_id: job_id || null }
      }, { status: 404 });
    }

    let findings = [];
    let submission = null;
    let allSubmissions = [];
    try {
      allSubmissions = await base44.asServiceRole.entities.InspectionSubmission.filter({ job_id: report.job_id });
      if (report.inspection_id) {
        const linked = await base44.asServiceRole.entities.InspectionSubmission.get(report.inspection_id);
        if (linked && !allSubmissions.find(s => s.id === linked.id)) {
          allSubmissions = [linked, ...allSubmissions];
        }
      }
    } catch(e) {}

    submission = allSubmissions.find(s => s.id === report.inspection_id) || allSubmissions[0] || null;

    try {
      const allFindings = [];
      for (const sub of allSubmissions) {
        const subFindings = await base44.entities.Finding.filter({ inspection_id: sub.id });
        allFindings.push(...subFindings);
      }
      const seen = new Set();
      findings = allFindings.filter(f => {
        const key = `${f.triggered_by_rule}_${f.finding_type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } catch(e) {}

    let job = null;
    try { job = await base44.asServiceRole.entities.Job.get(report.job_id); } catch(e) {}

    let questionsRaw = [];
    try {
      const allQs = await base44.asServiceRole.entities.InspectionQuestion.filter({ is_active: true }, 'sort_order');
      const itype = report.inspection_type || 'interior';
      questionsRaw = allQs.filter(q =>
        (!q.inspection_type || q.inspection_type === itype || q.inspection_type === 'both') &&
        q.show_on_report !== false
      );
    } catch(e) {}

    const sortQuestions = (qs) => {
      const result = [];
      const placed = new Set();
      const place = (q) => {
        if (placed.has(q.id)) return;
        placed.add(q.id);
        result.push(q);
        qs.filter(c => {
          if (placed.has(c.id)) return false;
          try { const r = JSON.parse(c.visibility_rule || ''); return r.question_id === q.id; } catch { return false; }
        }).forEach(place);
      };
      qs.filter(q => !q.visibility_rule).forEach(place);
      qs.filter(q => !placed.has(q.id)).forEach(place);
      return result;
    };
    const questions = sortQuestions(questionsRaw);

    let allRules = [];
    try { allRules = await base44.asServiceRole.entities.LogicRule.filter({ is_active: true }); } catch(e) {}

    let answers = {};
    for (const sub of allSubmissions) {
      let subAnswers = {};
      try { subAnswers = JSON.parse(sub.answers || '{}'); } catch(e) {}
      for (const [key, val] of Object.entries(subAnswers)) {
        const existing = answers[key];
        const incomingEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
        const existingEmpty = existing === undefined || existing === null || existing === '' || (Array.isArray(existing) && existing.length === 0);
        if (existingEmpty && !incomingEmpty) {
          answers[key] = val;
        } else if (!existingEmpty && !incomingEmpty && key !== 'undefined') {
          if (key.endsWith('_photos') && Array.isArray(existing) && Array.isArray(val)) {
            const merged = [...existing];
            for (const url of val) { if (!merged.includes(url)) merged.push(url); }
            answers[key] = merged;
          }
        }
      }
    }

    const doc = new jsPDF();
    const margin = 20;
    const pageW = 210;
    let y = margin;

    const checkPage = (neededHeight = 15) => {
      if (y + neededHeight > 278) {
        doc.addPage();
        y = margin;
      }
    };

    // ─── HEADER ───────────────────────────────────────────────
    const headerH = 42;
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageW, headerH, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('LEHIGH VALLEY CHIMNEY', 105, 18, { align: 'center' });
    doc.setFontSize(13);
    doc.setFont('helvetica', 'normal');
    const reportTypeLabel = report.inspection_type === 'exterior' ? 'Exterior Inspection Report' : 'Interior Inspection Report';
    doc.text(reportTypeLabel, 105, 30, { align: 'center' });
    y = headerH + 10;

    // ─── PAGE 1: SUMMARY ──────────────────────────────────────

    doc.setDrawColor(234, 179, 8);
    doc.setLineWidth(1);
    doc.line(margin, y, pageW - margin, y);
    y += 8;

    // Customer info grid
    const infoRows = [
      ['Customer Name', report.customer_name || '—', 'Technician Name', report.technician_name || '—'],
      ['Service Address', [report.address, [job?.city, job?.state, job?.zip].filter(Boolean).join(' ')].filter(Boolean).join('\n') || '—', 'Inspection Date', report.inspection_date || '—'],
      ['Overall Condition', (report.overall_condition || '—').toUpperCase(), 'Report Status', (report.status || '—').toUpperCase()],
    ];

    infoRows.forEach(row => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(row[0] + ':', margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      const lines1 = doc.splitTextToSize(String(row[1]), 80);
      doc.text(lines1, margin + 35, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);
      doc.text(row[2] + ':', 110, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text(String(row[3]), 142, y);
      y += Math.max(lines1.length, 1) * 5 + 2;
    });

    y += 4;

    // Property Information box
    {
      const propRows = [
        ['Property Type', submission?.property_type ? submission.property_type.replace(/_/g,' ') : '—',
         'Chimney Type', submission?.chimney_type ? submission.chimney_type.replace(/_/g,' ') : '—'],
        ['Appliance Type', submission?.appliance_type ? submission.appliance_type.replace(/_/g,' ') : '—', '', ''],
      ];
      const boxH = 8 + propRows.length * 7 + 4;
      checkPage(boxH + 4);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, 170, boxH, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text('PROPERTY INFORMATION', margin + 4, y + 7);
      let rowY = y + 14;
      propRows.forEach(row => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(row[0] + ':', margin + 4, rowY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 41, 59);
        doc.text(String(row[1]), margin + 40, rowY);
        if (row[2]) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(71, 85, 105);
          doc.text(row[2] + ':', 110, rowY);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(30, 41, 59);
          doc.text(String(row[3]), 138, rowY);
        }
        rowY += 7;
      });
      y += boxH + 8;
    }

    // ─── CRITICAL CONDITIONS ──────────────────────────────────
    const criticalItems = [];
    for (const q of questions) {
      if (q.id === FRONT_OF_HOUSE_ID) continue;
      const answer = answers[q.id];
      if (!answer) continue;
      const vals = Array.isArray(answer) ? answer : [answer];
      if (vals.some(v => isCritical(v))) {
        const photos = answers[`${q.id}_photos`] || [];
        criticalItems.push({ label: q.question_text, answer: vals.join(', '), photos });
      }
    }

    if (criticalItems.length > 0) {
      checkPage(20);
      doc.setFillColor(254, 242, 242);
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.5);
      const critStartY = y;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(153, 27, 27);
      doc.text('⚠  CRITICAL CONDITIONS SUMMARY', margin + 4, y + 8);
      y += 14;

      for (const item of criticalItems) {
        checkPage(22);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        const labelLines = doc.splitTextToSize(item.label, 110);
        doc.text(labelLines, margin + 4, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(220, 38, 38);
        doc.text('Response: ' + item.answer, margin + 4, y + labelLines.length * 4 + 1);

        y += labelLines.length * 4 + 10;
        doc.setDrawColor(254, 202, 202);
        doc.line(margin + 4, y - 3, pageW - margin - 4, y - 3);
      }

      doc.setFillColor(254, 242, 242);
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.8);
      doc.roundedRect(margin, critStartY, 170, y - critStartY + 2, 2, 2, 'S');
      y += 6;
    }

    // ─── FRONT OF HOUSE PHOTO ─────────────────────────────────
    const frontDirect = answers[FRONT_OF_HOUSE_ID];
    const frontSuffix = answers[`${FRONT_OF_HOUSE_ID}_photos`];
    const frontPhotos = (Array.isArray(frontDirect) && frontDirect.length > 0)
      ? frontDirect
      : (Array.isArray(frontSuffix) && frontSuffix.length > 0)
        ? frontSuffix
        : (typeof frontDirect === 'string' && frontDirect ? [frontDirect] : []);

    if (frontPhotos.length > 0) {
      const maxImgH = Math.max(40, 285 - 8 - y - 6);
      const maxImgW = 170;
      checkPage(40);
      doc.setDrawColor(234, 179, 8);
      doc.setLineWidth(1);
      doc.line(margin, y, pageW - margin, y);
      y += 6;

      try {
        const imgData = await fetchImageAsBase64(frontPhotos[0]);
        if (imgData) {
          doc.addImage(imgData, imgData.includes('png') ? 'PNG' : 'JPEG', margin, y, maxImgW, 70);
          y += 75;
        }
      } catch(e) { console.error('Front photo error:', e.message); }
    }

    // ─── PAGE 2+: INSPECTION DETAILS ──────────────────────────
    doc.addPage();
    y = margin;

    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageW, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('INSPECTION DETAILS', 105, 9, { align: 'center' });
    y = 22;

    for (const q of questions) {
      if (q.id === FRONT_OF_HOUSE_ID) continue;

      const answer = answers[q.id];
      const questionPhotos = q.question_type === 'photo'
        ? (Array.isArray(answer) ? answer : (answer ? [answer] : []))
        : (answers[`${q.id}_photos`] || []);

      const answerIsEmpty = answer === undefined || answer === null || answer === '' || (Array.isArray(answer) && answer.length === 0);
      if (answerIsEmpty && questionPhotos.length === 0) continue;

      const answerText = Array.isArray(answer) ? answer.join(', ') : (answer !== undefined && answer !== null ? String(answer) : '');
      const answerLines = doc.splitTextToSize(answerText, 155);
      const labelLines = doc.splitTextToSize(q.question_text, 155);
      const photoH = questionPhotos.length > 0 ? 75 : 0;
      const sectionH = 6 + labelLines.length * 5 + 6 + answerLines.length * 5 + photoH + 40;
      checkPage(sectionH);

      const sectionStartY = y;

      // Question heading
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text(labelLines, margin, y);
      y += labelLines.length * 5 + 2;

      // Gold underline
      doc.setDrawColor(234, 179, 8);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageW - margin, y);
      y += 4;

      // Response
      if (answerText !== '' && q.question_type !== 'photo') {
        const critical = isCritical(answerText);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text('Response:', margin, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(critical ? 220 : 30, critical ? 38 : 41, critical ? 38 : 59);
        doc.text(answerLines, margin + 22, y);
        y += Math.max(answerLines.length, 1) * 5 + 3;
      }

      // Photos
      if (questionPhotos.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text('Photo(s):', margin, y);
        y += 5;

        for (const photoUrl of questionPhotos) {
          try {
            const imgData = await fetchImageAsBase64(photoUrl);
            if (imgData) {
              checkPage(78);
              const photoBoxX = margin;
              const photoBoxY = y + 2;
              const photoBoxWidth = 170;
              const photoBoxHeight = 66;
              const naturalWidth = 170;
              const naturalHeight = 127;
              const scale = Math.min(photoBoxWidth / naturalWidth, photoBoxHeight / naturalHeight);
              const drawWidth = naturalWidth * scale;
              const drawHeight = naturalHeight * scale;
              const drawX = photoBoxX + (photoBoxWidth - drawWidth) / 2;
              const drawY = photoBoxY + (photoBoxHeight - drawHeight) / 2;
              doc.addImage(imgData, imgData.includes('png') ? 'PNG' : 'JPEG', drawX, drawY, drawWidth, drawHeight);
              y += 75;
            }
          } catch(e) { console.error('Section photo error:', e.message); }
        }
      }

      // Section border
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin - 2, sectionStartY - 4, 174, y - sectionStartY + 8, 1, 1, 'S');
      y += 10;
    }

    // ─── FOOTER ───────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 285, pageW, 12, 'F');
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text('Lehigh Valley Chimney — Confidential Inspection Report', margin, 292);
      doc.text(`Page ${i} of ${pageCount}`, 185, 292);
    }

    const pdfBytes = doc.output('arraybuffer');
    const filename = `inspection-report-${report.customer_name?.replace(/\s+/g, '-') || report.id}.pdf`;

    // Upload the PDF and return a URL the client can open
    const file = new File([pdfBytes], filename, { type: 'application/pdf' });
    const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file });

    // Cache the URL on the report record
    await base44.asServiceRole.entities.InspectionReport.update(report.id, { pdf_url: uploadResult.file_url }).catch(() => {});

    return Response.json({ url: uploadResult.file_url, filename });
  } catch (error) {
    console.error('PDF generation error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});