import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

/**
 * Geração de PDF no servidor, síncrona (documentos de balcão: receita,
 * carteira, atestados). Sem Chromium: PDFKit é suficiente e leve.
 * O documento traz linha de assinatura manual: o hash interno é integridade,
 * não assinatura eletrônica com valor jurídico.
 */

export interface PrescriptionPdfInput {
  tenantName: string;
  header: string | null;
  controlled: boolean;
  number: number;
  issuedAt: Date;
  patient: {
    name: string;
    species: string;
    breed: string | null;
    weight: string | null;
    guardianName: string | null;
  };
  prescriber: { name: string; council: string | null };
  items: Array<{
    drugName: string;
    concentration: string | null;
    posology: string;
    quantity: string | null;
    withdrawal: string | null;
  }>;
  notes: string | null;
}

export interface CertificatePdfInput {
  tenantName: string;
  header: string | null;
  title: string;
  number?: number | null;
  issuedAt: Date;
  patient: { name: string; species: string; breed: string | null; guardianName: string | null };
  professional: { name: string; council: string | null };
  bodyLines: string[];
  footNote?: string | null;
}

export interface VaccinationCardInput {
  tenantName: string;
  patient: { name: string; species: string; breed: string | null; guardianName: string | null };
  vaccines: Array<{ name: string; date: string; lot: string | null; nextDue: string | null; professional: string | null }>;
  preventives: Array<{ name: string; date: string; kind: string; nextDue: string | null }>;
}

export interface MedicalRecordPdfInput {
  tenantName: string;
  patient: { name: string; species: string; breed: string | null; guardianName: string | null; birthDate: string | null };
  encounters: Array<{
    date: string;
    service: string | null;
    professional: string | null;
    status: string;
    sections: Array<{ title: string; body: string }>;
    diagnoses: string[];
  }>;
}

const MARGIN = 48;

@Injectable()
export class PdfService {
  private async render(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Producer: 'CHIRON' } });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        build(doc);
        doc.end();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private header(doc: PDFKit.PDFDocument, tenantName: string, subtitle: string, header?: string | null): void {
    doc.fillColor('#0F766E').fontSize(16).font('Helvetica-Bold').text(tenantName, { align: 'left' });
    if (header) doc.fillColor('#475569').fontSize(9).font('Helvetica').text(header);
    doc.moveDown(0.3);
    doc.fillColor('#0F172A').fontSize(13).font('Helvetica-Bold').text(subtitle);
    doc
      .moveTo(MARGIN, doc.y + 6)
      .lineTo(doc.page.width - MARGIN, doc.y + 6)
      .strokeColor('#CBD5E1')
      .stroke();
    doc.moveDown(1);
    doc.fillColor('#0F172A').font('Helvetica').fontSize(10);
  }

  private labeled(doc: PDFKit.PDFDocument, label: string, value: string): void {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#475569').text(`${label}: `, { continued: true });
    doc.font('Helvetica').fillColor('#0F172A').text(value);
  }

  private signatureBlock(doc: PDFKit.PDFDocument, name: string, council: string | null): void {
    const y = Math.min(doc.y + 40, doc.page.height - 140);
    doc.y = y;
    doc.moveTo(MARGIN + 90, y).lineTo(doc.page.width - MARGIN - 90, y).strokeColor('#94A3B8').stroke();
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(10).fillColor('#0F172A').text(name, { align: 'center' });
    if (council) doc.fontSize(9).fillColor('#475569').text(`CRMV ${council}`, { align: 'center' });
    doc.fontSize(7).fillColor('#94A3B8').text('Assinatura e carimbo', { align: 'center' });
  }

  async prescription(input: PrescriptionPdfInput): Promise<Buffer> {
    const copies = input.controlled ? ['1ª via - Farmácia', '2ª via - Paciente'] : ['Via única'];

    return this.render((doc) => {
      copies.forEach((copyLabel, index) => {
        if (index > 0) doc.addPage();

        this.header(
          doc,
          input.tenantName,
          input.controlled ? 'Receituário de Controle Especial' : 'Receituário Veterinário',
          input.header,
        );

        doc.fontSize(8).fillColor('#64748B').text(`${copyLabel} · Receita nº ${input.number}`, { align: 'right' });
        doc.moveDown(0.5);

        this.labeled(doc, 'Paciente', `${input.patient.name} (${input.patient.species}${input.patient.breed ? `, ${input.patient.breed}` : ''})`);
        if (input.patient.weight) this.labeled(doc, 'Peso', `${input.patient.weight} kg`);
        if (input.patient.guardianName) this.labeled(doc, 'Tutor', input.patient.guardianName);
        this.labeled(doc, 'Data', input.issuedAt.toLocaleDateString('pt-BR'));

        doc.moveDown(0.8);
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F172A').text('Prescrição');
        doc.moveDown(0.3);

        input.items.forEach((item, i) => {
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#0F172A');
          doc.text(`${i + 1}. ${item.drugName}${item.concentration ? ` ${item.concentration}` : ''}`);
          doc.font('Helvetica').fontSize(9).fillColor('#334155');
          doc.text(`    ${item.posology}`, { width: doc.page.width - MARGIN * 2 - 20 });
          if (item.quantity) doc.text(`    Quantidade: ${item.quantity}`);
          if (item.withdrawal) doc.fillColor('#B45309').text(`    ${item.withdrawal}`).fillColor('#334155');
          doc.moveDown(0.4);
        });

        if (input.notes) {
          doc.moveDown(0.4);
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#475569').text('Orientações');
          doc.font('Helvetica').fontSize(9).fillColor('#334155').text(input.notes);
        }

        if (input.controlled) {
          doc.moveDown(0.8);
          doc.font('Helvetica').fontSize(8).fillColor('#475569');
          doc.text('Identificação do comprador: ____________________________________________');
          doc.moveDown(0.3);
          doc.text('Documento: ______________________  Telefone: ______________________');
        }

        this.signatureBlock(doc, input.prescriber.name, input.prescriber.council);

        doc
          .fontSize(7)
          .fillColor('#94A3B8')
          .text(
            `Documento emitido por CHIRON em ${input.issuedAt.toLocaleString('pt-BR')}. Validade conforme legislação vigente.`,
            MARGIN,
            doc.page.height - 60,
            { align: 'center', width: doc.page.width - MARGIN * 2 },
          );
      });
    });
  }

  async certificate(input: CertificatePdfInput): Promise<Buffer> {
    return this.render((doc) => {
      this.header(doc, input.tenantName, input.title, input.header);
      if (input.number) doc.fontSize(8).fillColor('#64748B').text(`Nº ${input.number}`, { align: 'right' });

      doc.moveDown(0.5);
      this.labeled(
        doc,
        'Paciente',
        `${input.patient.name} (${input.patient.species}${input.patient.breed ? `, ${input.patient.breed}` : ''})`,
      );
      if (input.patient.guardianName) this.labeled(doc, 'Tutor', input.patient.guardianName);
      this.labeled(doc, 'Data', input.issuedAt.toLocaleDateString('pt-BR'));

      doc.moveDown(1);
      doc.font('Helvetica').fontSize(11).fillColor('#0F172A');
      for (const line of input.bodyLines) {
        doc.text(line, { align: 'justify', lineGap: 4 });
        doc.moveDown(0.5);
      }

      if (input.footNote) {
        doc.moveDown(0.5);
        doc.fontSize(8).fillColor('#64748B').text(input.footNote);
      }

      this.signatureBlock(doc, input.professional.name, input.professional.council);
    });
  }

  async vaccinationCard(input: VaccinationCardInput): Promise<Buffer> {
    return this.render((doc) => {
      this.header(doc, input.tenantName, 'Carteira de Vacinação e Preventivos', null);

      this.labeled(
        doc,
        'Paciente',
        `${input.patient.name} (${input.patient.species}${input.patient.breed ? `, ${input.patient.breed}` : ''})`,
      );
      if (input.patient.guardianName) this.labeled(doc, 'Tutor', input.patient.guardianName);
      doc.moveDown(0.8);

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F172A').text('Vacinas');
      doc.moveDown(0.2);
      if (input.vaccines.length === 0) {
        doc.font('Helvetica').fontSize(9).fillColor('#64748B').text('Nenhuma vacina registrada.');
      } else {
        for (const v of input.vaccines) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#0F172A').text(`${v.date} · ${v.name}`);
          doc.font('Helvetica').fontSize(8).fillColor('#475569');
          const details = [
            v.lot ? `Lote ${v.lot}` : null,
            v.nextDue ? `Próxima dose ${v.nextDue}` : null,
            v.professional,
          ]
            .filter(Boolean)
            .join(' · ');
          if (details) doc.text(`    ${details}`);
          doc.moveDown(0.2);
        }
      }

      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F172A').text('Vermífugos e antiparasitários');
      doc.moveDown(0.2);
      if (input.preventives.length === 0) {
        doc.font('Helvetica').fontSize(9).fillColor('#64748B').text('Nenhum registro.');
      } else {
        for (const p of input.preventives) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#0F172A').text(`${p.date} · ${p.name}`);
          doc.font('Helvetica').fontSize(8).fillColor('#475569');
          const details = [p.kind, p.nextDue ? `Próxima dose ${p.nextDue}` : null].filter(Boolean).join(' · ');
          if (details) doc.text(`    ${details}`);
          doc.moveDown(0.2);
        }
      }
    });
  }

  async medicalRecord(input: MedicalRecordPdfInput): Promise<Buffer> {
    return this.render((doc) => {
      this.header(doc, input.tenantName, 'Prontuário do paciente', null);

      this.labeled(
        doc,
        'Paciente',
        `${input.patient.name} (${input.patient.species}${input.patient.breed ? `, ${input.patient.breed}` : ''})`,
      );
      if (input.patient.guardianName) this.labeled(doc, 'Tutor', input.patient.guardianName);
      if (input.patient.birthDate) this.labeled(doc, 'Nascimento', input.patient.birthDate);
      this.labeled(doc, 'Emitido em', new Date().toLocaleString('pt-BR'));
      doc.moveDown(0.8);

      if (input.encounters.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor('#64748B').text('Nenhum atendimento registrado.');
      }

      for (const encounter of input.encounters) {
        if (doc.y > doc.page.height - 160) doc.addPage();
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F766E');
        doc.text(`${encounter.date} · ${encounter.service ?? 'Atendimento'}`);
        doc.font('Helvetica').fontSize(8).fillColor('#64748B');
        doc.text(`${encounter.professional ?? 'Profissional não informado'} · ${encounter.status}`);
        doc.moveDown(0.3);

        for (const section of encounter.sections) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155').text(section.title);
          doc.font('Helvetica').fontSize(9).fillColor('#0F172A').text(section.body, { lineGap: 2 });
          doc.moveDown(0.3);
        }

        if (encounter.diagnoses.length > 0) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155').text('Diagnósticos');
          doc.font('Helvetica').fontSize(9).fillColor('#0F172A').text(encounter.diagnoses.join('; '));
        }

        doc.moveDown(0.6);
        doc.moveTo(MARGIN, doc.y).lineTo(doc.page.width - MARGIN, doc.y).strokeColor('#E2E8F0').stroke();
        doc.moveDown(0.6);
      }
    });
  }
}
