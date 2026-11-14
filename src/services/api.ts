import type {
  AdministrativeUnit,
  Application,
  ApplicationApproval,
  ApplicationAttachment,
  ApplicationStatus,
  ApprovalAuthorityAssignment,
  Certificate,
  CertificateEvent,
  CertificateTemplate,
  CertificateVerificationLog,
  CitizenNotification,
  ContactInquiry,
  DashboardStatsResponse,
  DeveloperAccessRequest,
  DeveloperDiagnosticsResponse,
  EscalatedComplaint,
  HoldingTaxRecord,
  InitialAdminAccountSummary,
  InitialAdminResetExecuteResponse,
  InitialAdminResetPreviewResponse,
  MonitoringObservation,
  Notice,
  PaginatedResult,
  PermissionAuditLog,
  PermissionKey,
  PermissionScope,
  RbacPermission,
  RbacRole,
  RefundRequest,
  RoleCategory,
  RolePermissionAssignment,
  RolePermissionEntry,
  SanitizedEnvironmentDiagnostics,
  Service,
  StaffMember,
  SystemEnvironmentSummary,
  SystemSettings,
  TradeLicenseRecord,
  UserAccount,
  UserPermissionOverride,
  UserRole,
  UserRoleAssignment,
  UserSession,
  VerificationResponse,
  WardOrDepartment,
} from '../types';

function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fallback =
      res.status === 403
        ? 'এই কার্যক্রম সম্পাদনের অনুমতি আপনার রোলের নেই (403 Forbidden)।'
        : `Request failed (${res.status})`;
    const err = new Error(data.message_bn || data.error || fallback) as Error & {
      status?: number;
      data?: unknown;
    };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

async function parseErrorMessage(res: Response, fallbackMsg: string): Promise<string> {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    const data = (await res.json().catch(() => ({}))) as { message_bn?: string; error?: string };
    return data.message_bn || data.error || `${fallbackMsg} (${res.status})`;
  }
  return `${fallbackMsg} (${res.status})`;
}

export async function triggerAuthenticatedDownload(
  url: string,
  fallbackFilename: string,
  token?: string
): Promise<void> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers, credentials: 'include' });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'ফাইল ডাউনলোড ব্যর্থ হয়েছে'));
  }
  const blob = await res.blob();
  if (!blob || blob.size === 0) {
    throw new Error('ডাউনলোডকৃত ফাইলটি খালি।');
  }
  const disp = res.headers.get('content-disposition') || '';
  const match = disp.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] ? match[1].trim() : fallbackFilename;

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2500);
}

export const api = {
  async login(payload: {
    login_type?: 'citizen' | 'administrative';
    role?: UserRole;
    administrative_unit_id?: string;
    username: string;
    password: string;
    otp?: string;
    remember_me?: boolean;
  }): Promise<{
    token: string;
    remember_token?: string;
    redirect_dashboard?: string;
    session: UserSession;
  }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async restoreRememberSession(rememberToken?: string): Promise<{
    token: string;
    remember_token: string;
    redirect_dashboard?: string;
    session: UserSession;
  }> {
    const res = await fetch('/api/auth/remember', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(rememberToken ? { remember_token: rememberToken } : {}),
    });
    return parseJson(res);
  },

  async registerCitizen(payload: {
    name_bn: string;
    username: string;
    mobile: string;
    email?: string;
    password: string;
  }): Promise<{
    token: string;
    redirect_dashboard?: string;
    session: UserSession;
  }> {
    const res = await fetch('/api/auth/register-citizen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async switchRole(role: UserRole, administrativeUnitId?: string, username?: string): Promise<{ token: string; session: UserSession }> {
    const res = await fetch('/api/auth/switch-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ role, administrative_unit_id: administrativeUnitId, username }),
    });
    return parseJson(res);
  },

  async logout(token?: string, rememberToken?: string): Promise<void> {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: authHeaders(token),
      credentials: 'include',
      body: JSON.stringify(rememberToken ? { remember_token: rememberToken } : {}),
    });
  },

  async requestPasswordReset(identifier: string): Promise<{ success: boolean; message_bn: string; reset_token_preview?: string }> {
    const res = await fetch('/api/auth/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    });
    return parseJson(res);
  },

  async confirmPasswordReset(token: string, newPassword: string): Promise<{ success: boolean; message_bn: string }> {
    const res = await fetch('/api/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password: newPassword }),
    });
    return parseJson(res);
  },

  async getDashboardStats(token: string, unitId?: string): Promise<DashboardStatsResponse> {
    const url = unitId && unitId !== 'all' ? `/api/dashboard/stats?unit_id=${encodeURIComponent(unitId)}` : '/api/dashboard/stats';
    const res = await fetch(url, { headers: authHeaders(token) });
    return parseJson(res);
  },

  async getCitizenPortal(params: { mobile?: string; tracking_no?: string; token?: string }): Promise<{
    applications: Application[];
    certificates: Certificate[];
    notifications: CitizenNotification[];
  }> {
    const q = new URLSearchParams();
    if (params.mobile) q.set('mobile', params.mobile);
    if (params.tracking_no) q.set('tracking_no', params.tracking_no);
    const res = await fetch(`/api/citizen/portal?${q.toString()}`, {
      headers: params.token ? authHeaders(params.token) : undefined,
    });
    return parseJson(res);
  },

  async listApplications(token: string, unitId?: string): Promise<Application[]> {
    const url = unitId && unitId !== 'all' ? `/api/applications?unit_id=${encodeURIComponent(unitId)}` : '/api/applications';
    const res = await fetch(url, { headers: authHeaders(token) });
    return parseJson(res);
  },

  async queryApplications(
    token: string,
    params: {
      unit_id?: string;
      q?: string;
      status?: string;
      service_id?: string;
      page?: number;
      page_size?: number;
    }
  ): Promise<PaginatedResult<Application>> {
    const q = new URLSearchParams({ paginated: '1' });
    if (params.unit_id && params.unit_id !== 'all') q.set('unit_id', params.unit_id);
    if (params.q) q.set('q', params.q);
    if (params.status) q.set('status', params.status);
    if (params.service_id) q.set('service_id', params.service_id);
    if (params.page) q.set('page', String(params.page));
    if (params.page_size) q.set('page_size', String(params.page_size));
    const res = await fetch(`/api/applications?${q.toString()}`, { headers: authHeaders(token) });
    return parseJson(res);
  },

  async getApplicationByTracking(
    trackingNo: string,
    token?: string
  ): Promise<Application & { certificate?: Certificate; notifications?: CitizenNotification[]; approvals?: ApplicationApproval[] }> {
    const res = await fetch(`/api/applications/${encodeURIComponent(trackingNo)}`, {
      headers: token ? authHeaders(token) : undefined,
    });
    return parseJson(res);
  },

  async createApplication(
    app: Partial<Application> & { save_as_draft?: boolean },
    token?: string
  ): Promise<Application> {
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(app),
    });
    return parseJson(res);
  },

  async updateApplicationDraft(
    token: string,
    applicationId: string,
    payload: Partial<Application> & {
      save_as_draft?: boolean;
      submit_to_chairman?: boolean;
      secretary_note?: string;
    }
  ): Promise<Application> {
    const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async getApplicationDraftPreview(
    token: string,
    applicationId: string
  ): Promise<{
    is_draft: boolean;
    draft_label_bn: string;
    can_download_final_pdf: boolean;
    can_print_final_pdf: boolean;
    application: Application;
    institution: {
      id: string;
      name_bn: string;
      upazila_bn: string;
      district_bn: string;
      approving_officer_name_bn: string;
      approving_officer_title_bn: string;
    };
  }> {
    const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/draft-preview`, {
      headers: authHeaders(token),
    });
    return parseJson(res);
  },

  async returnApplicationToSecretary(
    token: string,
    applicationId: string,
    note?: string
  ): Promise<Application> {
    const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/return-to-secretary`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ note }),
    });
    return parseJson(res);
  },

  async uploadAttachment(
    applicationId: string,
    payload: { doc_type: 'nid' | 'photo' | 'proof' | 'other'; original_name: string; mime_type: string; content_base64: string }
  ): Promise<ApplicationAttachment> {
    const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async resubmitApplication(
    applicationId: string,
    payload: {
      tracking_no?: string;
      applicant_name_bn?: string;
      father_name_bn?: string;
      mother_name_bn?: string;
      nid_or_birth_reg?: string;
      mobile?: string;
      ward_no?: number;
      village_or_area_bn?: string;
      present_address_bn?: string;
      permanent_address_bn?: string;
      correction_response: string;
    },
    token?: string
  ): Promise<Application> {
    const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/resubmit`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async rejectApplication(token: string, applicationId: string, reason: string): Promise<Application> {
    const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/reject`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ reason }),
    });
    return parseJson(res);
  },

  async checkoutPayment(payload: {
    applicationId: string;
    method: 'bkash' | 'nagad' | 'rocket' | 'card';
    amount: number;
  }): Promise<{ success: boolean; transaction_id: string; amount: number; paid_at: string; application: Application }> {
    const res = await fetch('/api/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async updateApplicationStatus(
    token: string,
    id: string,
    status: ApplicationStatus,
    note?: string
  ): Promise<Application> {
    const res = await fetch(`/api/applications/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ status, note, reason: note }),
    });
    return parseJson(res);
  },

  async assignApplicationOfficer(
    token: string,
    applicationId: string,
    payload: { staff_id?: string; officer_name_bn?: string }
  ): Promise<Application> {
    const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/assign`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async requestApplicationCorrection(token: string, applicationId: string, reason: string): Promise<Application> {
    const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/request-correction`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ reason }),
    });
    return parseJson(res);
  },

  async getApplicationHistory(
    token: string,
    applicationId: string
  ): Promise<{ approvals: ApplicationApproval[]; events: CertificateEvent[] }> {
    const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/history`, {
      headers: authHeaders(token),
    });
    return parseJson(res);
  },

  async finalApproveAndIssue(
    token: string,
    applicationId: string,
    options?: { notes?: string; expires_in_days?: number | null }
  ): Promise<{
    already_issued: boolean;
    certificate: Certificate;
    application: Application;
    verification_url?: string;
  }> {
    const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/final-approve`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(options || {}),
    });
    return parseJson(res);
  },

  async listCertificates(token: string, unitId?: string): Promise<Certificate[]> {
    const url = unitId && unitId !== 'all' ? `/api/certificates?unit_id=${encodeURIComponent(unitId)}` : '/api/certificates';
    const res = await fetch(url, { headers: authHeaders(token) });
    return parseJson(res);
  },

  async queryCertificates(
    token: string,
    params: {
      unit_id?: string;
      q?: string;
      status?: string;
      service_id?: string;
      date_from?: string;
      date_to?: string;
      sort_by?: string;
      sort_dir?: 'asc' | 'desc';
      page?: number;
      page_size?: number;
    }
  ): Promise<PaginatedResult<Certificate>> {
    const q = new URLSearchParams({ paginated: '1' });
    if (params.unit_id && params.unit_id !== 'all') q.set('unit_id', params.unit_id);
    if (params.q) q.set('q', params.q);
    if (params.status) q.set('status', params.status);
    if (params.service_id) q.set('service_id', params.service_id);
    if (params.date_from) q.set('date_from', params.date_from);
    if (params.date_to) q.set('date_to', params.date_to);
    if (params.sort_by) q.set('sort_by', params.sort_by);
    if (params.sort_dir) q.set('sort_dir', params.sort_dir);
    if (params.page) q.set('page', String(params.page));
    if (params.page_size) q.set('page_size', String(params.page_size));
    const res = await fetch(`/api/certificates?${q.toString()}`, { headers: authHeaders(token) });
    return parseJson(res);
  },

  getCertificatesExportUrl(
    token: string,
    params: { unit_id?: string; q?: string; status?: string; service_id?: string }
  ): string {
    const q = new URLSearchParams({ auth_token: token });
    if (params.unit_id && params.unit_id !== 'all') q.set('unit_id', params.unit_id);
    if (params.q) q.set('q', params.q);
    if (params.status) q.set('status', params.status);
    if (params.service_id) q.set('service_id', params.service_id);
    return `/api/certificates/export?${q.toString()}`;
  },

  async revokeCertificate(
    token: string,
    certificateId: string,
    reason: string
  ): Promise<{ success: boolean; certificate: Certificate }> {
    const res = await fetch(`/api/certificates/${encodeURIComponent(certificateId)}/revoke`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ reason }),
    });
    return parseJson(res);
  },

  async reissueCertificate(
    token: string,
    certificateId: string,
    options?: { notes?: string; expires_in_days?: number | null }
  ): Promise<{
    already_issued: boolean;
    certificate: Certificate;
    application: Application;
    verification_url?: string;
  }> {
    const res = await fetch(`/api/certificates/${encodeURIComponent(certificateId)}/reissue`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(options || {}),
    });
    return parseJson(res);
  },

  async getCertificateHistory(
    token: string,
    certificateId: string
  ): Promise<{
    events: CertificateEvent[];
    approvals: ApplicationApproval[];
    verification_logs: CertificateVerificationLog[];
  }> {
    const res = await fetch(`/api/certificates/${encodeURIComponent(certificateId)}/history`, {
      headers: authHeaders(token),
    });
    return parseJson(res);
  },

  async getCertificateById(
    certificateId: string,
    options?: { authToken?: string; trackingNo?: string }
  ): Promise<Certificate> {
    const q = new URLSearchParams();
    if (options?.trackingNo) q.set('tracking_no', options.trackingNo);
    const qs = q.toString();
    const res = await fetch(
      `/api/certificates/${encodeURIComponent(certificateId)}${qs ? `?${qs}` : ''}`,
      {
        headers: options?.authToken ? authHeaders(options.authToken) : {},
        credentials: 'include',
      }
    );
    return parseJson(res);
  },

  async verifyCertificate(rawToken: string): Promise<{ statusCode: number; data: VerificationResponse }> {
    const res = await fetch(`/api/verify/${encodeURIComponent(rawToken.trim())}`);
    const data = (await res.json().catch(() => ({}))) as VerificationResponse;
    return { statusCode: res.status, data };
  },

  async getAuditLogs(
    token: string,
    unitId?: string
  ): Promise<{
    events: CertificateEvent[];
    verification_logs: CertificateVerificationLog[];
    approvals: ApplicationApproval[];
  }> {
    const url = unitId && unitId !== 'all' ? `/api/audit-logs?unit_id=${encodeURIComponent(unitId)}` : '/api/audit-logs';
    const res = await fetch(url, { headers: authHeaders(token) });
    return parseJson(res);
  },

  async getCertificateTemplates(): Promise<CertificateTemplate[]> {
    const res = await fetch('/api/certificate-templates');
    return parseJson(res);
  },

  async getNotifications(params: { token?: string; trackingNo?: string }): Promise<CitizenNotification[]> {
    const url = params.trackingNo
      ? `/api/notifications?tracking_no=${encodeURIComponent(params.trackingNo)}`
      : '/api/notifications';
    const res = await fetch(url, { headers: authHeaders(params.token) });
    return parseJson(res);
  },

  getPdfDownloadUrl(
    certificateId: string,
    options: { authToken?: string; trackingNo?: string; inline?: boolean; orientation?: 'portrait' | 'landscape' }
  ): string {
    const q = new URLSearchParams();
    if (options.authToken) q.set('auth_token', options.authToken);
    if (options.trackingNo) q.set('tracking_no', options.trackingNo);
    if (options.inline) q.set('inline', '1');
    if (options.orientation === 'landscape') q.set('orientation', 'landscape');
    const qs = q.toString();
    return `/api/certificates/${encodeURIComponent(certificateId)}/pdf${qs ? `?${qs}` : ''}`;
  },

  async fetchCertificatePdfBlob(
    certificateId: string,
    options?: {
      authToken?: string;
      trackingNo?: string;
      inline?: boolean;
      orientation?: 'portrait' | 'landscape';
    }
  ): Promise<{ blob: Blob; bytes: Uint8Array; filename: string }> {
    const q = new URLSearchParams();
    if (options?.trackingNo) q.set('tracking_no', options.trackingNo);
    if (options?.inline) q.set('inline', '1');
    if (options?.orientation === 'landscape') q.set('orientation', 'landscape');
    const qs = q.toString();
    const url = `/api/certificates/${encodeURIComponent(certificateId)}/pdf${qs ? `?${qs}` : ''}`;
    const headers: Record<string, string> = {};
    if (options?.authToken) headers['Authorization'] = `Bearer ${options.authToken}`;

    const res = await fetch(url, { headers, credentials: 'include' });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'অফিসিয়াল সনদ PDF লোড করা যায়নি'));
    }

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/pdf')) {
      throw new Error('সার্ভার থেকে বৈধ PDF ফাইল পাওয়া যায়নি।');
    }

    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    if (
      bytes.byteLength < 100 ||
      bytes[0] !== 0x25 || // %
      bytes[1] !== 0x50 || // P
      bytes[2] !== 0x44 || // D
      bytes[3] !== 0x46 || // F
      bytes[4] !== 0x2d // -
    ) {
      throw new Error('ডাউনলোডকৃত PDF ফাইলটি ক্ষতিগ্রস্ত বা অসম্পূর্ণ।');
    }

    const disp = res.headers.get('content-disposition') || '';
    const match = disp.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] ? match[1].trim() : `PottoyonBD_Certificate_${certificateId}.pdf`;
    return {
      blob: new Blob([bytes], { type: 'application/pdf' }),
      bytes,
      filename,
    };
  },

  // --- Holding Taxes, Trade Licenses, Notices ---
  async listHoldingTaxes(unitId?: string, token?: string): Promise<HoldingTaxRecord[]> {
    const url = unitId && unitId !== 'all' ? `/api/holding-taxes?unit_id=${encodeURIComponent(unitId)}` : '/api/holding-taxes';
    const res = await fetch(url, { headers: token ? authHeaders(token) : undefined });
    return parseJson(res);
  },

  async createHoldingTax(token: string, payload: Partial<HoldingTaxRecord>): Promise<HoldingTaxRecord> {
    const res = await fetch('/api/holding-taxes', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async payHoldingTax(token: string, id: string, amount?: number): Promise<HoldingTaxRecord> {
    const res = await fetch(`/api/holding-taxes/${encodeURIComponent(id)}/pay`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ amount }),
    });
    return parseJson(res);
  },

  async listTradeLicenses(unitId?: string, token?: string): Promise<TradeLicenseRecord[]> {
    const url = unitId && unitId !== 'all' ? `/api/trade-licenses?unit_id=${encodeURIComponent(unitId)}` : '/api/trade-licenses';
    const res = await fetch(url, { headers: token ? authHeaders(token) : undefined });
    return parseJson(res);
  },

  async createTradeLicense(token: string, payload: Partial<TradeLicenseRecord>): Promise<TradeLicenseRecord> {
    const res = await fetch('/api/trade-licenses', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async renewTradeLicense(token: string, id: string): Promise<TradeLicenseRecord> {
    const res = await fetch(`/api/trade-licenses/${encodeURIComponent(id)}/renew`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    return parseJson(res);
  },

  async listNotices(unitId?: string): Promise<Notice[]> {
    const url = unitId && unitId !== 'all' ? `/api/notices?unit_id=${encodeURIComponent(unitId)}` : '/api/notices';
    const res = await fetch(url);
    return parseJson(res);
  },

  async createNotice(token: string, payload: Partial<Notice>): Promise<Notice> {
    const res = await fetch('/api/notices', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async deleteNotice(token: string, id: string): Promise<void> {
    const res = await fetch(`/api/notices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    await parseJson(res);
  },

  // --- Staff, Wards/Departments, Institutions, Services, Permissions, Settings ---
  async listStaff(token: string, unitId?: string): Promise<StaffMember[]> {
    const url = unitId && unitId !== 'all' ? `/api/staff?unit_id=${encodeURIComponent(unitId)}` : '/api/staff';
    const res = await fetch(url, { headers: authHeaders(token) });
    return parseJson(res);
  },

  async createStaff(token: string, payload: Partial<StaffMember>): Promise<StaffMember> {
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async updateStaff(token: string, id: string, payload: Partial<StaffMember>): Promise<StaffMember> {
    const res = await fetch(`/api/staff/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async listWardsDepartments(token: string, unitId?: string, kind?: 'ward' | 'department'): Promise<WardOrDepartment[]> {
    const q = new URLSearchParams();
    if (unitId && unitId !== 'all') q.set('unit_id', unitId);
    if (kind) q.set('kind', kind);
    const qs = q.toString();
    const res = await fetch(`/api/wards-departments${qs ? `?${qs}` : ''}`, { headers: authHeaders(token) });
    return parseJson(res);
  },

  async createWardOrDepartment(token: string, payload: Partial<WardOrDepartment>): Promise<WardOrDepartment> {
    const res = await fetch('/api/wards-departments', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async updateInstitution(
    token: string,
    unitId: string,
    payload: Partial<AdministrativeUnit>
  ): Promise<AdministrativeUnit> {
    const res = await fetch(`/api/institutions/${encodeURIComponent(unitId)}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async listServices(): Promise<Service[]> {
    const res = await fetch('/api/services');
    return parseJson(res);
  },

  async updateService(token: string, serviceId: string, payload: Partial<Service>): Promise<Service> {
    const res = await fetch(`/api/services/${encodeURIComponent(serviceId)}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async listRolePermissions(token: string): Promise<RolePermissionEntry[]> {
    const res = await fetch('/api/role-permissions', { headers: authHeaders(token) });
    return parseJson(res);
  },

  async updateRolePermission(
    token: string,
    role: UserRole,
    payload: Partial<RolePermissionEntry>
  ): Promise<RolePermissionEntry> {
    const res = await fetch(`/api/role-permissions/${encodeURIComponent(role)}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async getSystemSettings(token: string): Promise<SystemSettings> {
    const res = await fetch('/api/system-settings', { headers: authHeaders(token) });
    return parseJson(res);
  },

  async updateSystemSettings(token: string, payload: Partial<SystemSettings>): Promise<SystemSettings> {
    const res = await fetch('/api/system-settings', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async submitContactInquiry(payload: { name: string; phone: string; subject: string; message: string }, token?: string): Promise<ContactInquiry> {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async listContactInquiries(token: string): Promise<ContactInquiry[]> {
    const res = await fetch('/api/contact', { headers: authHeaders(token) });
    return parseJson(res);
  },

  // --- RBAC Management, Monitoring, Refund Requests & Backups ---
  async getInitialAdminResetPreview(token: string): Promise<InitialAdminResetPreviewResponse> {
    const res = await fetch('/api/rbac/initial-reset/preview', { headers: authHeaders(token) });
    return parseJson(res);
  },

  async executeInitialAdminReset(
    token: string,
    payload: { confirm_deactivation: boolean; reason_bn?: string }
  ): Promise<InitialAdminResetExecuteResponse> {
    const res = await fetch('/api/rbac/initial-reset/execute', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async issueAccountInvitationToken(
    token: string,
    userId: string,
    expiresInHours = 24
  ): Promise<{
    invitation_id: string;
    user_id: string;
    username: string;
    display_name: string;
    invitation_token: string;
    expires_at: string;
  }> {
    const res = await fetch(
      `/api/rbac/initial-reset/accounts/${encodeURIComponent(userId)}/issue-invitation`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ expires_in_hours: expiresInHours }),
      }
    );
    return parseJson(res);
  },

  async verifyInitialAdminIdentity(
    token: string,
    userId: string,
    payload: { verification_note_bn: string; activate_account?: boolean }
  ): Promise<InitialAdminAccountSummary> {
    const res = await fetch(
      `/api/rbac/initial-reset/accounts/${encodeURIComponent(userId)}/verify-identity`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      }
    );
    return parseJson(res);
  },

  async setupAccountPasswordWithInvitation(payload: {
    username: string;
    invitation_token: string;
    new_password: string;
    mobile?: string;
    email?: string;
  }): Promise<{
    user_id: string;
    username: string;
    account_status: string;
    identity_verified: boolean;
    is_active: boolean;
    message_bn: string;
  }> {
    const res = await fetch('/api/auth/setup-account-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async listRbacRoles(token: string): Promise<RbacRole[]> {
    const res = await fetch('/api/rbac/roles', { headers: authHeaders(token) });
    return parseJson(res);
  },

  async createRbacRole(
    token: string,
    payload: {
      slug: string;
      name_en: string;
      name_bn: string;
      category: RoleCategory;
      institution_type?: 'union_parishad' | 'municipality' | null;
      default_scope: PermissionScope;
      description_bn: string;
      assignments: Array<{ permission_key: PermissionKey; scope: PermissionScope }>;
    }
  ): Promise<RbacRole> {
    const res = await fetch('/api/rbac/roles', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async toggleRbacRoleStatus(token: string, slug: string, isActive: boolean): Promise<RbacRole> {
    const res = await fetch(`/api/rbac/roles/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ is_active: isActive }),
    });
    return parseJson(res);
  },

  async listRbacPermissions(token: string): Promise<RbacPermission[]> {
    const res = await fetch('/api/rbac/permissions', { headers: authHeaders(token) });
    return parseJson(res);
  },

  async getRolePermissionsV2(token: string, slug: string): Promise<RolePermissionAssignment[]> {
    const res = await fetch(`/api/rbac/roles/${encodeURIComponent(slug)}/permissions`, {
      headers: authHeaders(token),
    });
    return parseJson(res);
  },

  async updateRolePermissionsV2(
    token: string,
    slug: string,
    assignments: Array<{ permission_key: PermissionKey; scope: PermissionScope; granted: boolean }>,
    reasonBn?: string
  ): Promise<RolePermissionAssignment[]> {
    const res = await fetch(`/api/rbac/roles/${encodeURIComponent(slug)}/permissions`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ assignments, reason_bn: reasonBn }),
    });
    return parseJson(res);
  },

  async listRbacUsers(token: string, unitId?: string): Promise<UserAccount[]> {
    const url = unitId && unitId !== 'all' ? `/api/rbac/users?unit_id=${encodeURIComponent(unitId)}` : '/api/rbac/users';
    const res = await fetch(url, { headers: authHeaders(token) });
    return parseJson(res);
  },

  async createRbacUser(
    token: string,
    payload: {
      username: string;
      password: string;
      name_bn: string;
      title_bn: string;
      mobile: string;
      email?: string;
      primary_role: string;
      administrative_unit_id?: string | null;
      ward_nos?: number[];
      departments?: string[];
      mfa_enabled?: boolean;
    }
  ): Promise<UserAccount> {
    const res = await fetch('/api/rbac/users', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async toggleRbacUserStatus(token: string, userId: string, isActive: boolean): Promise<UserAccount> {
    const res = await fetch(`/api/rbac/users/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ is_active: isActive }),
    });
    return parseJson(res);
  },

  async adminResetUserPassword(token: string, userId: string, newPassword: string): Promise<void> {
    const res = await fetch(`/api/rbac/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ new_password: newPassword }),
    });
    await parseJson(res);
  },

  async assignUserRoleAndScope(
    token: string,
    userId: string,
    payload: {
      role_slug: string;
      administrative_unit_id?: string | null;
      ward_nos?: number[];
      departments?: string[];
      expires_at?: string | null;
      reason_bn?: string;
    }
  ): Promise<UserRoleAssignment> {
    const res = await fetch(`/api/rbac/users/${encodeURIComponent(userId)}/roles`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async revokeUserRole(token: string, userId: string, assignmentId: string): Promise<void> {
    const res = await fetch(
      `/api/rbac/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(assignmentId)}`,
      { method: 'DELETE', headers: authHeaders(token) }
    );
    await parseJson(res);
  },

  async createUserOverride(
    token: string,
    userId: string,
    payload: {
      permission_key: PermissionKey;
      scope: PermissionScope;
      effect: 'grant' | 'revoke';
      expires_at?: string | null;
      reason_bn?: string;
    }
  ): Promise<UserPermissionOverride> {
    const res = await fetch(`/api/rbac/users/${encodeURIComponent(userId)}/overrides`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async revokeUserOverride(token: string, userId: string, overrideId: string): Promise<void> {
    const res = await fetch(
      `/api/rbac/users/${encodeURIComponent(userId)}/overrides/${encodeURIComponent(overrideId)}`,
      { method: 'DELETE', headers: authHeaders(token) }
    );
    await parseJson(res);
  },

  async listApprovalAuthorities(token: string, unitId?: string): Promise<ApprovalAuthorityAssignment[]> {
    const url = unitId && unitId !== 'all'
      ? `/api/rbac/approval-authorities?unit_id=${encodeURIComponent(unitId)}`
      : '/api/rbac/approval-authorities';
    const res = await fetch(url, { headers: authHeaders(token) });
    return parseJson(res);
  },

  async grantApprovalAuthority(
    token: string,
    payload: {
      user_id: string;
      role_slug: string;
      administrative_unit_id: string;
      service_id: string;
      max_fee_limit?: number | null;
      expires_at?: string | null;
      delegation_note_bn: string;
      allow_self_approval?: boolean;
    }
  ): Promise<ApprovalAuthorityAssignment> {
    const res = await fetch('/api/rbac/approval-authorities', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async revokeApprovalAuthority(token: string, id: string): Promise<void> {
    const res = await fetch(`/api/rbac/approval-authorities/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    await parseJson(res);
  },

  async listPermissionAuditLogs(token: string, unitId?: string): Promise<PermissionAuditLog[]> {
    const url = unitId && unitId !== 'all'
      ? `/api/rbac/audit-logs?unit_id=${encodeURIComponent(unitId)}`
      : '/api/rbac/audit-logs';
    const res = await fetch(url, { headers: authHeaders(token) });
    return parseJson(res);
  },

  async listMonitoringObservations(token: string, unitId?: string): Promise<MonitoringObservation[]> {
    const url = unitId && unitId !== 'all'
      ? `/api/monitoring/observations?unit_id=${encodeURIComponent(unitId)}`
      : '/api/monitoring/observations';
    const res = await fetch(url, { headers: authHeaders(token) });
    return parseJson(res);
  },

  async createMonitoringObservation(
    token: string,
    payload: { administrative_unit_id: string; application_id?: string | null; observation_bn: string; severity?: 'info' | 'warning' | 'critical' | 'overdue' }
  ): Promise<MonitoringObservation> {
    const res = await fetch('/api/monitoring/observations', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async listRefundRequests(token: string, unitId?: string): Promise<RefundRequest[]> {
    const url = unitId && unitId !== 'all'
      ? `/api/payments/refund-requests?unit_id=${encodeURIComponent(unitId)}`
      : '/api/payments/refund-requests';
    const res = await fetch(url, { headers: authHeaders(token) });
    return parseJson(res);
  },

  async createRefundRequest(
    token: string,
    payload: { application_id: string; amount?: number; reason_bn: string }
  ): Promise<RefundRequest> {
    const res = await fetch('/api/payments/refund-requests', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async decideRefundRequest(
    token: string,
    id: string,
    decision: 'approved' | 'rejected'
  ): Promise<RefundRequest> {
    const res = await fetch(`/api/payments/refund-requests/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ decision }),
    });
    return parseJson(res);
  },

  // --- Escalated Complaints (UNO / Super Admin / Citizen / Institution) ---
  async listComplaints(token: string, unitId?: string): Promise<EscalatedComplaint[]> {
    const url =
      unitId && unitId !== 'all'
        ? `/api/complaints?unit_id=${encodeURIComponent(unitId)}`
        : '/api/complaints';
    const res = await fetch(url, { headers: authHeaders(token) });
    return parseJson(res);
  },

  async createComplaint(
    token: string,
    payload: {
      administrative_unit_id: string;
      application_id?: string | null;
      subject_bn: string;
      details_bn: string;
    }
  ): Promise<EscalatedComplaint> {
    const res = await fetch('/api/complaints', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async updateComplaint(
    token: string,
    id: string,
    payload: {
      status: EscalatedComplaint['status'];
      forwarded_to_unit_id?: string | null;
      resolution_note_bn?: string;
    }
  ): Promise<EscalatedComplaint> {
    const res = await fetch(`/api/complaints/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  // --- Developer / Technical Admin Console & Controlled Production Access ---
  async getDeveloperDiagnostics(token: string): Promise<DeveloperDiagnosticsResponse> {
    const res = await fetch('/api/developer/diagnostics', {
      headers: authHeaders(token),
    });
    return parseJson(res);
  },

  async listDeveloperAccessRequests(token: string): Promise<DeveloperAccessRequest[]> {
    const res = await fetch('/api/developer/access-requests', {
      headers: authHeaders(token),
    });
    return parseJson(res);
  },

  async createDeveloperAccessRequest(
    token: string,
    payload: {
      scope: string;
      reason_bn: string;
      duration_minutes: number;
    }
  ): Promise<DeveloperAccessRequest> {
    const res = await fetch('/api/developer/access-requests', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async decideDeveloperAccessRequest(
    token: string,
    id: string,
    decision: 'approved' | 'rejected' | 'revoked'
  ): Promise<DeveloperAccessRequest> {
    const res = await fetch(`/api/developer/access-requests/${encodeURIComponent(id)}/decide`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ decision }),
    });
    return parseJson(res);
  },

  async recordDeveloperDeployment(
    token: string,
    payload: {
      environment: 'staging' | 'production';
      version_tag: string;
      change_summary_bn: string;
    }
  ): Promise<{
    id: string;
    environment: string;
    version_tag: string;
    change_summary_bn: string;
    executed_by: string;
    created_at: string;
  }> {
    const res = await fetch('/api/developer/deployments', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async getMe(token?: string): Promise<{ session: UserSession }> {
    const res = await fetch('/api/auth/me', {
      headers: authHeaders(token),
      credentials: 'include',
    });
    return parseJson(res);
  },

  // --- Website CMS, Visual Page Builder & Extended Notices ---
  async getPublicCms(): Promise<{
    branding: Record<string, unknown>;
    version: number;
    pages: Array<Record<string, unknown>>;
    notices_extended: Array<Record<string, unknown>>;
  }> {
    const res = await fetch('/api/cms/public');
    return parseJson(res);
  },

  async getCmsConfig(token: string): Promise<{
    version: number;
    status: string;
    config: Record<string, string | boolean | number>;
    revisions: Array<Record<string, unknown>>;
    notices_extended: Array<Record<string, unknown>>;
  }> {
    const res = await fetch('/api/cms/config', { headers: authHeaders(token) });
    return parseJson(res);
  },

  async updateCmsConfig(
    token: string,
    payload: {
      config: Record<string, unknown>;
      status?: 'draft' | 'published';
      note_bn?: string;
    }
  ): Promise<{
    version: number;
    status: string;
    config: Record<string, unknown>;
  }> {
    const res = await fetch('/api/cms/config', {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async restoreCmsRevision(
    token: string,
    revisionId: string
  ): Promise<{ version: number; config: Record<string, unknown> }> {
    const res = await fetch(`/api/cms/restore/${encodeURIComponent(revisionId)}`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    return parseJson(res);
  },

  async createExtendedNotice(
    token: string,
    payload: {
      notice_type: 'popup' | 'ticker' | 'emergency' | 'scheduled';
      title_bn: string;
      title_en?: string;
      content_bn: string;
      content_en?: string;
      priority?: string;
      status?: 'draft' | 'published';
      scheduled_at?: string | null;
      expires_at?: string | null;
    }
  ): Promise<Record<string, unknown>> {
    const res = await fetch('/api/cms/notices-extended', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async listCmsPages(token: string): Promise<Array<Record<string, unknown>>> {
    const res = await fetch('/api/cms/pages', { headers: authHeaders(token) });
    return parseJson(res);
  },

  async createCmsPage(
    token: string,
    payload: {
      slug: string;
      title_bn: string;
      title_en?: string;
      meta_title?: string;
      meta_description?: string;
      status?: 'draft' | 'published' | 'scheduled';
      blocks?: Array<{ id?: string; type: string; content_bn: string; content_en?: string }>;
    }
  ): Promise<Record<string, unknown>> {
    const res = await fetch('/api/cms/pages', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async updateCmsPage(
    token: string,
    id: string,
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`/api/cms/pages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  // --- AI SEO Studio & Technical SEO ---
  async getSeoOverview(token: string): Promise<{
    audits: Array<Record<string, unknown>>;
    proposals: Array<Record<string, unknown>>;
    technical: Record<string, unknown>;
    gemini_configured: boolean;
  }> {
    const res = await fetch('/api/seo/overview', { headers: authHeaders(token) });
    return parseJson(res);
  },

  async runSeoAudit(token: string): Promise<Record<string, unknown>> {
    const res = await fetch('/api/seo/audit', {
      method: 'POST',
      headers: authHeaders(token),
    });
    return parseJson(res);
  },

  async proposeAiSeo(
    token: string,
    payload: { target_path: string; focus_topic: string }
  ): Promise<Record<string, unknown>> {
    const res = await fetch('/api/seo/ai-propose', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async decideSeoProposal(
    token: string,
    proposalId: string,
    decision: 'approved' | 'rejected'
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`/api/seo/proposals/${encodeURIComponent(proposalId)}/decision`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ decision }),
    });
    return parseJson(res);
  },

  // --- AI Content Studio ---
  async listAiContentDrafts(token: string): Promise<Array<Record<string, unknown>>> {
    const res = await fetch('/api/ai-content/drafts', { headers: authHeaders(token) });
    return parseJson(res);
  },

  async generateAiContentDraft(
    token: string,
    payload: { content_type: string; prompt: string }
  ): Promise<Record<string, unknown>> {
    const res = await fetch('/api/ai-content/generate', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async decideAiContentDraft(
    token: string,
    id: string,
    decision: 'publish' | 'reject'
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`/api/ai-content/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ decision }),
    });
    return parseJson(res);
  },

  // --- Certificate Design Center ---
  async getCertificateDesignConfig(): Promise<{
    id: string;
    version_tag: string;
    config: Record<string, unknown>;
    updated_at: string;
  }> {
    const res = await fetch('/api/certificate-design');
    return parseJson(res);
  },

  async updateCertificateDesignConfig(
    token: string,
    payload: { version_tag?: string; config: Record<string, unknown> }
  ): Promise<{
    id: string;
    version_tag: string;
    config: Record<string, unknown>;
    updated_at: string;
  }> {
    const res = await fetch('/api/certificate-design', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  // --- Payment, SMTP, SMS & API Integrations ---
  async getIntegrationsOverview(token: string): Promise<{
    providers: Array<Record<string, unknown>>;
    delivery_logs: Array<Record<string, unknown>>;
    notification_templates: Array<Record<string, unknown>>;
  }> {
    const res = await fetch('/api/integrations/providers', { headers: authHeaders(token) });
    return parseJson(res);
  },

  async updateIntegrationProvider(
    token: string,
    providerKey: string,
    payload: {
      mode?: 'sandbox' | 'live';
      confirm_live?: boolean;
      is_enabled?: boolean;
      public_config?: Record<string, unknown>;
      secret?: string;
    }
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`/api/integrations/providers/${encodeURIComponent(providerKey)}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async testIntegrationProvider(
    token: string,
    payload: { provider_key: string; recipient?: string }
  ): Promise<Record<string, unknown>> {
    const res = await fetch('/api/integrations/test', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  // --- Privacy-Conscious Analytics ---
  async getAnalyticsOverview(
    token: string,
    period: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'monthly'
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`/api/analytics/overview?period=${encodeURIComponent(period)}`, {
      headers: authHeaders(token),
    });
    return parseJson(res);
  },

  // --- Developer AI Debug Console ---
  async getDeveloperErrorLogs(token: string): Promise<{
    logs: Array<Record<string, unknown>>;
    patches: Array<Record<string, unknown>>;
  }> {
    const res = await fetch('/api/developer/error-logs', { headers: authHeaders(token) });
    return parseJson(res);
  },

  async runDeveloperAiDebug(
    token: string,
    payload: { log_message: string; error_log_id?: string }
  ): Promise<Record<string, unknown>> {
    const res = await fetch('/api/developer/ai-debug', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  // --- Security Operations Center (SOC) ---
  async getSecurityOverview(token: string): Promise<{
    ip_rules: Array<Record<string, unknown>>;
    phone_rules: Array<Record<string, unknown>>;
    rate_limits: Array<Record<string, unknown>>;
    active_sessions: Array<Record<string, unknown>>;
    locked_or_failed_users: Array<Record<string, unknown>>;
  }> {
    const res = await fetch('/api/security/overview', { headers: authHeaders(token) });
    return parseJson(res);
  },

  async createIpRule(
    token: string,
    payload: {
      ip_or_cidr: string;
      rule_type: 'block' | 'allow';
      reason_bn: string;
      duration_minutes?: number;
      expires_at?: string;
    }
  ): Promise<Record<string, unknown>> {
    const res = await fetch('/api/security/ip-rules', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async removeIpRule(token: string, id: string): Promise<void> {
    const res = await fetch(`/api/security/ip-rules/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    await parseJson(res);
  },

  async createPhoneRule(
    token: string,
    payload: { mobile: string; reason_bn: string; duration_minutes?: number }
  ): Promise<Record<string, unknown>> {
    const res = await fetch('/api/security/phone-rules', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async removePhoneRule(token: string, id: string): Promise<void> {
    const res = await fetch(`/api/security/phone-rules/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    await parseJson(res);
  },

  async terminateSecuritySession(token: string, sessionId: string): Promise<void> {
    const res = await fetch(`/api/security/sessions/${encodeURIComponent(sessionId)}/terminate`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    await parseJson(res);
  },

  // --- System Health & Verified Backups ---
  async getSystemHealthOverview(token: string): Promise<Record<string, unknown>> {
    const res = await fetch('/api/system-health/overview', { headers: authHeaders(token) });
    return parseJson(res);
  },

  async createSystemBackup(
    token: string,
    backupType = 'full_encrypted'
  ): Promise<Record<string, unknown>> {
    const res = await fetch('/api/backups/create', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ backup_type: backupType }),
    });
    return parseJson(res);
  },

  async verifySystemBackup(token: string, backupId: string): Promise<Record<string, unknown>> {
    const res = await fetch(`/api/backups/${encodeURIComponent(backupId)}/verify`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    return parseJson(res);
  },

  async restoreSystemBackup(token: string, backupId: string): Promise<Record<string, unknown>> {
    const res = await fetch(`/api/backups/${encodeURIComponent(backupId)}/restore`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    return parseJson(res);
  },

  async getSystemEnvironment(): Promise<SystemEnvironmentSummary> {
    const res = await fetch('/api/system/environment');
    return parseJson<SystemEnvironmentSummary>(res);
  },

  async getAdminEnvironmentDiagnostics(token: string): Promise<SanitizedEnvironmentDiagnostics> {
    const res = await fetch('/api/admin/environment-diagnostics', {
      headers: authHeaders(token),
    });
    return parseJson<SanitizedEnvironmentDiagnostics>(res);
  },

  async resetDatabase(): Promise<void> {
    const res = await fetch('/api/reset', { method: 'POST' });
    await parseJson(res);
  },
};
