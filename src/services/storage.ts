import QRCode from 'qrcode';
import {
  AdministrativeUnit,
  Service,
  Application,
  Certificate,
  HoldingTaxRecord,
  TradeLicenseRecord,
  Notice,
  ApplicationStatus
} from '../types';
import {
  INITIAL_INSTITUTIONS,
  INITIAL_SERVICES,
  INITIAL_APPLICATIONS,
  INITIAL_CERTIFICATES,
  INITIAL_HOLDING_TAXES,
  INITIAL_TRADE_LICENSES,
  INITIAL_NOTICES
} from '../data/seedData';

const STORAGE_KEYS = {
  INSTITUTIONS: 'pottoyonbd_institutions_v1',
  SERVICES: 'pottoyonbd_services_v1',
  APPLICATIONS: 'pottoyonbd_applications_v1',
  CERTIFICATES: 'pottoyonbd_certificates_v1',
  HOLDING_TAXES: 'pottoyonbd_holding_taxes_v1',
  TRADE_LICENSES: 'pottoyonbd_trade_licenses_v1',
  NOTICES: 'pottoyonbd_notices_v1',
  INITIALIZED: 'pottoyonbd_initialized_v1',
};

class StorageService {
  private isBrowser = typeof window !== 'undefined';

  constructor() {
    this.ensureInitialized();
  }

  private getItem<T>(key: string, fallback: T): T {
    if (!this.isBrowser) return fallback;
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.warn(`Error reading ${key} from localStorage:`, e);
      return fallback;
    }
  }

  private setItem<T>(key: string, value: T): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`Error writing ${key} to localStorage:`, e);
    }
  }

  public ensureInitialized(): void {
    if (!this.isBrowser) return;
    const isInit = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
    if (!isInit) {
      this.resetDatabase();
    }
  }

  public resetDatabase(): void {
    this.setItem(STORAGE_KEYS.INSTITUTIONS, INITIAL_INSTITUTIONS);
    this.setItem(STORAGE_KEYS.SERVICES, INITIAL_SERVICES);
    this.setItem(STORAGE_KEYS.APPLICATIONS, INITIAL_APPLICATIONS);
    this.setItem(STORAGE_KEYS.CERTIFICATES, INITIAL_CERTIFICATES);
    this.setItem(STORAGE_KEYS.HOLDING_TAXES, INITIAL_HOLDING_TAXES);
    this.setItem(STORAGE_KEYS.TRADE_LICENSES, INITIAL_TRADE_LICENSES);
    this.setItem(STORAGE_KEYS.NOTICES, INITIAL_NOTICES);
    if (this.isBrowser) {
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    }
  }

  // --- Institutions ---
  public getInstitutions(): AdministrativeUnit[] {
    return this.getItem<AdministrativeUnit[]>(STORAGE_KEYS.INSTITUTIONS, INITIAL_INSTITUTIONS);
  }

  public getInstitutionById(id: string): AdministrativeUnit | undefined {
    return this.getInstitutions().find((i) => i.id === id);
  }

  public getInstitutionByCode(code: string): AdministrativeUnit | undefined {
    return this.getInstitutions().find((i) => i.code === code);
  }

  public getUnions(): AdministrativeUnit[] {
    return this.getInstitutions().filter((i) => i.type === 'union_parishad');
  }

  public getMunicipality(): AdministrativeUnit | undefined {
    return this.getInstitutions().find((i) => i.type === 'municipality');
  }

  // --- Services ---
  public getServices(): Service[] {
    return this.getItem<Service[]>(STORAGE_KEYS.SERVICES, INITIAL_SERVICES);
  }

  public getServiceById(id: string): Service | undefined {
    return this.getServices().find((s) => s.id === id);
  }

  // --- Applications (Tenant-Isolated) ---
  public getApplications(administrativeUnitId?: string): Application[] {
    const apps = this.getItem<Application[]>(STORAGE_KEYS.APPLICATIONS, INITIAL_APPLICATIONS);
    if (!administrativeUnitId) return apps;
    return apps.filter((a) => a.administrative_unit_id === administrativeUnitId);
  }

  public getApplicationById(id: string): Application | undefined {
    return this.getApplications().find((a) => a.id === id);
  }

  public getApplicationByTrackingNo(trackingNo: string): Application | undefined {
    const clean = trackingNo.trim().toUpperCase();
    return this.getApplications().find((a) => a.tracking_no.toUpperCase() === clean);
  }

  public saveApplication(app: Application): Application {
    const apps = this.getApplications();
    const index = apps.findIndex((a) => a.id === app.id);
    if (index >= 0) {
      apps[index] = { ...app, updated_at: new Date().toISOString() };
    } else {
      apps.unshift(app);
    }
    this.setItem(STORAGE_KEYS.APPLICATIONS, apps);
    return app;
  }

  public updateApplicationStatus(
    id: string,
    status: ApplicationStatus,
    note?: string,
    officerName?: string
  ): Application | undefined {
    const app = this.getApplicationById(id);
    if (!app) return undefined;

    app.status = status;
    app.updated_at = new Date().toISOString();
    if (officerName) {
      app.assigned_officer = officerName;
    }
    if (note) {
      app.review_notes = app.review_notes || [];
      app.review_notes.push(note);
    }

    return this.saveApplication(app);
  }

  // --- Certificate Generation Engine ---
  public async issueCertificate(
    applicationId: string,
    officerName: string,
    officerTitle: string
  ): Promise<Certificate | undefined> {
    const app = this.getApplicationById(applicationId);
    if (!app) return undefined;

    const unit = this.getInstitutionById(app.administrative_unit_id);
    const service = this.getServiceById(app.service_id);

    // Format serial number
    const certNumber = '10' + Math.floor(100000000 + Math.random() * 900000000).toString();
    const token = certNumber;
    const verificationUrl = `https://pottoyonbd.gov.bd/verify/${token}`;

    // Generate real QR code
    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(verificationUrl, {
        margin: 1,
        width: 160,
        color: {
          dark: '#0f5132',
          light: '#ffffff',
        },
      });
    } catch (e) {
      console.warn('QR code generation error:', e);
    }

    const todayBn = new Intl.DateTimeFormat('bn-BD', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());

    const todayEn = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());

    const certificate: Certificate = {
      id: `cert_${token}`,
      certificate_no: certNumber,
      verification_token: token,
      application_id: app.id,
      administrative_unit_id: app.administrative_unit_id,
      service_id: app.service_id,
      certificate_title_bn: service?.name_bn || 'প্রত্যয়নপত্র',
      issue_date_bn: todayBn,
      issue_date_en: todayEn,
      applicant_name_bn: app.applicant_name_bn,
      father_name_bn: app.father_name_bn,
      mother_name_bn: app.mother_name_bn,
      permanent_address_bn: `গ্রাম/হোল্ডিং: ${app.village_or_area_bn || unit?.name_bn || ''}, রোড/ব্লক/সেক্টর: ${app.road_block_sector_bn || 'প্রধান সড়ক'}, ডাকঘর: ${app.post_office_bn || 'পাবনা সদর'}, ওয়ার্ড নম্বর: ${app.ward_no}, ${unit?.name_bn || ''}, থানা: পাবনা সদর, উপজেলা: পাবনা সদর, জেলা: পাবনা।`,
      present_address_bn: app.present_address_bn || `গ্রাম/হোল্ডিং: ${app.village_or_area_bn || unit?.name_bn || ''}, ওয়ার্ড: ${app.ward_no}, ${unit?.name_bn || ''}, পাবনা সদর, পাবনা।`,
      heirs: app.heirs,
      qr_data_url: qrDataUrl,
      verification_url: verificationUrl,
      officer_name_bn: officerName || unit?.chairman_or_mayor_name_bn || 'মোঃ ইউনুস আলী',
      officer_title_bn: officerTitle || unit?.chairman_or_mayor_title_bn || 'প্রশাসক / চেয়ারম্যান',
      status: 'valid',
    };

    // Save certificate
    const certs = this.getItem<Certificate[]>(STORAGE_KEYS.CERTIFICATES, INITIAL_CERTIFICATES);
    certs.unshift(certificate);
    this.setItem(STORAGE_KEYS.CERTIFICATES, certs);

    // Update application
    app.certificate_id = certificate.id;
    app.verification_token = certificate.verification_token;
    app.status = 'certificate_issued';
    app.review_notes = app.review_notes || [];
    app.review_notes.push(`সনদপত্র ইস্যু সম্পন্ন (সনদ নম্বর: ${certNumber})।`);
    this.saveApplication(app);

    return certificate;
  }

  public getCertificates(administrativeUnitId?: string): Certificate[] {
    const certs = this.getItem<Certificate[]>(STORAGE_KEYS.CERTIFICATES, INITIAL_CERTIFICATES);
    if (!administrativeUnitId) return certs;
    return certs.filter((c) => c.administrative_unit_id === administrativeUnitId);
  }

  public getCertificateByToken(token: string): Certificate | undefined {
    const clean = token.trim();
    return this.getCertificates().find(
      (c) => c.verification_token === clean || c.certificate_no === clean
    );
  }

  public getCertificateById(id: string): Certificate | undefined {
    return this.getCertificates().find((c) => c.id === id);
  }

  // --- Holding Tax ---
  public getHoldingTaxes(administrativeUnitId?: string): HoldingTaxRecord[] {
    const list = this.getItem<HoldingTaxRecord[]>(STORAGE_KEYS.HOLDING_TAXES, INITIAL_HOLDING_TAXES);
    if (!administrativeUnitId) return list;
    return list.filter((h) => h.administrative_unit_id === administrativeUnitId);
  }

  public payHoldingTax(
    id: string,
    amount: number,
    method: 'bkash' | 'nagad' | 'rocket' | 'card',
    trxId: string
  ): HoldingTaxRecord | undefined {
    const taxes = this.getHoldingTaxes();
    const record = taxes.find((t) => t.id === id);
    if (!record) return undefined;

    record.current_due = Math.max(0, record.current_due - amount);
    record.status = record.current_due === 0 ? 'paid' : 'partial';
    record.last_paid_at = new Date().toISOString().split('T')[0];
    this.setItem(STORAGE_KEYS.HOLDING_TAXES, taxes);
    return record;
  }

  // --- Trade License ---
  public getTradeLicenses(administrativeUnitId?: string): TradeLicenseRecord[] {
    const list = this.getItem<TradeLicenseRecord[]>(STORAGE_KEYS.TRADE_LICENSES, INITIAL_TRADE_LICENSES);
    if (!administrativeUnitId) return list;
    return list.filter((t) => t.administrative_unit_id === administrativeUnitId);
  }

  // --- Notices ---
  public getNotices(administrativeUnitId?: string): Notice[] {
    const list = this.getItem<Notice[]>(STORAGE_KEYS.NOTICES, INITIAL_NOTICES);
    if (!administrativeUnitId) return list;
    return list.filter((n) => !n.administrative_unit_id || n.administrative_unit_id === administrativeUnitId);
  }
}

export const storage = new StorageService();
