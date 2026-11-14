import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  FileText,
  Award,
  CreditCard,
  Home,
  Store,
  BarChart3,
  Settings,
  Bell,
  CheckCircle,
  Clock,
  Building2,
  ChevronRight,
  Download,
  QrCode,
  AlertTriangle,
  ExternalLink,
  Users,
  Layers,
  Megaphone,
  Sliders,
  Paperclip,
  UserPlus,
  RotateCcw,
  History,
  Shield,
  Eye,
  LogOut,
  PlusCircle,
  Terminal,
  MessageSquare,
  Globe,
  Sparkles,
  KeyRound,
  ShieldAlert,
} from 'lucide-react';
import {
  AdministrativeUnit,
  Application,
  ApplicationApproval,
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
  MonitoringObservation,
  Notice,
  PermissionKey,
  RefundRequest,
  RolePermissionEntry,
  SanitizedEnvironmentDiagnostics,
  Service,
  StaffMember,
  SystemSettings,
  TradeLicenseRecord,
  UserSession,
  WardOrDepartment,
} from '../../types';
import { storage } from '../../services/storage';
import { api, triggerAuthenticatedDownload } from '../../services/api';
import { ResponsiveDataTable, TableColumn } from '../common/ResponsiveDataTable';
import { CertificateManagementPanel } from './CertificateManagementPanel';
import {
  HoldingTaxPanel,
  PaymentsPanel,
  ReportsAndSettingsPanel,
  StaffPanel,
  TradeLicensePanel,
  WardsAndNoticesPanel,
} from './AdminOperationsPanels';
import { RoleManagementPanel } from './RoleManagementPanel';
import {
  EnterpriseCmsAndPagesPanel,
  EnterpriseDeveloperAiDebugPanel,
  EnterpriseIntegrationsAndCertDesignPanel,
  EnterpriseSecurityAndBackupsPanel,
  EnterpriseSeoAndAiStudioPanel,
} from './EnterpriseControlPanels';

type AdminMenuKey =
  | 'overview'
  | 'applications'
  | 'certificates'
  | 'monitoring'
  | 'complaints'
  | 'payments'
  | 'holding_tax'
  | 'trade_license'
  | 'staff'
  | 'wards_depts'
  | 'notices'
  | 'services_config'
  | 'reports'
  | 'role_management'
  | 'cms_builder'
  | 'ai_seo_studio'
  | 'integrations_center'
  | 'security_backups'
  | 'developer_console'
  | 'contact_messages'
  | 'settings';

const APP_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: 'খসড়া (Draft)', cls: 'bg-slate-200 text-slate-800' },
  pending_payment: { label: 'পেমেন্ট অপেক্ষমাণ', cls: 'bg-amber-100 text-amber-800' },
  paid: { label: 'ফি পরিশোধিত', cls: 'bg-sky-100 text-sky-800' },
  under_verification: { label: 'যাচাই চলছে (সচিব)', cls: 'bg-blue-100 text-blue-800' },
  correction_required: { label: 'সংশোধন প্রয়োজন', cls: 'bg-orange-100 text-orange-800' },
  forwarded_for_approval: { label: 'চেয়ারম্যান অনুমোদনের অপেক্ষায়', cls: 'bg-indigo-100 text-indigo-800' },
  approved: { label: 'অনুমোদিত', cls: 'bg-teal-100 text-teal-800' },
  certificate_issued: { label: 'সনদ ইস্যুকৃত', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'বাতিল', cls: 'bg-red-100 text-red-800' },
  refunded: { label: 'রিফান্ডকৃত', cls: 'bg-slate-200 text-slate-800' },
};

interface AdminDashboardProps {
  userSession: UserSession;
  institutions: AdministrativeUnit[];
  services: Service[];
  onViewCertificate: (cert: Certificate) => void;
  onPrintCertificate?: (cert: Certificate, trackingNo?: string) => void;
  onNavigateVerify?: (token: string) => void;
  onRefreshPlatformData?: () => Promise<void>;
  onApplyNewService?: (serviceId?: string, unitId?: string) => void;
  onLogout?: () => void;
  lang?: 'bn' | 'en';
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  userSession,
  institutions,
  services,
  onPrintCertificate,
  onNavigateVerify,
  onRefreshPlatformData,
  onApplyNewService,
  onLogout,
}) => {
  const [livePermissions, setLivePermissions] = useState(userSession.permissions || {});
  useEffect(() => {
    setLivePermissions(userSession.permissions || {});
  }, [userSession.permissions, userSession.user_id]);

  const perms = livePermissions;
  const hasPerm = useCallback((key: PermissionKey): boolean => Boolean(perms[key]), [perms]);

  const hasApprovalAuthorityFor = useCallback(
    (unitId?: string, serviceId?: string): boolean => {
      if (!hasPerm('applications.approve')) return false;
      const roleIsChairman = userSession.role === 'chairman' || (userSession.roles || []).includes('chairman');
      const assignedUnit = userSession.administrative_unit_id;
      if (roleIsChairman && (!unitId || assignedUnit === unitId)) {
        return true;
      }
      const nowMs = Date.now();
      return (userSession.approval_authorities || []).some((auth) => {
        if (auth.expires_at && new Date(auth.expires_at).getTime() <= nowMs) return false;
        const unitMatch =
          auth.administrative_unit_id === '*' || !unitId || auth.administrative_unit_id === unitId;
        const srvMatch = auth.service_id === '*' || !serviceId || auth.service_id === serviceId;
        return unitMatch && srvMatch;
      });
    },
    [hasPerm, userSession.role, userSession.roles, userSession.administrative_unit_id, userSession.approval_authorities]
  );

  const canAnyApproval = hasApprovalAuthorityFor();
  const isCrossUnit =
    perms['dashboard.view'] === 'global' || perms['dashboard.view'] === 'upazila';

  const allowedMenus: AdminMenuKey[] = [
    ...(hasPerm('dashboard.view') ? (['overview'] as AdminMenuKey[]) : []),
    ...(hasPerm('applications.view') ? (['applications'] as AdminMenuKey[]) : []),
    ...(hasPerm('certificates.view') ? (['certificates'] as AdminMenuKey[]) : []),
    ...(hasPerm('monitoring.observe') || userSession.role === 'supervisor'
      ? (['monitoring'] as AdminMenuKey[])
      : []),
    ...(hasPerm('complaints.view') || hasPerm('complaints.manage')
      ? (['complaints'] as AdminMenuKey[])
      : []),
    ...(hasPerm('payments.view') || hasPerm('payments.view_reports') || hasPerm('payments.request_refund')
      ? (['payments'] as AdminMenuKey[])
      : []),
    ...(hasPerm('payments.view') || hasPerm('payments.reconcile') ? (['holding_tax'] as AdminMenuKey[]) : []),
    ...(hasPerm('payments.view') || hasPerm('services.view') ? (['trade_license'] as AdminMenuKey[]) : []),
    ...(hasPerm('employees.view') || hasPerm('employees.manage') ? (['staff'] as AdminMenuKey[]) : []),
    ...(hasPerm('employees.view') || hasPerm('services.view') ? (['wards_depts'] as AdminMenuKey[]) : []),
    ...(hasPerm('notices.manage') || hasPerm('dashboard.view') ? (['notices'] as AdminMenuKey[]) : []),
    ...(hasPerm('services.manage') || hasPerm('services.configure_fees')
      ? (['services_config'] as AdminMenuKey[])
      : []),
    ...(hasPerm('reports.view') || hasPerm('audit_logs.view') ? (['reports'] as AdminMenuKey[]) : []),
    ...(hasPerm('roles.manage') || hasPerm('users.assign_role') || hasPerm('users.view') || hasPerm('settings.view')
      ? (['role_management'] as AdminMenuKey[])
      : []),
    ...(hasPerm('website.cms.manage') || hasPerm('website.pages.manage') || hasPerm('website.branding.manage')
      ? (['cms_builder'] as AdminMenuKey[])
      : []),
    ...(hasPerm('seo.view') || hasPerm('seo.audit') || hasPerm('seo.edit') || hasPerm('seo.publish')
      ? (['ai_seo_studio'] as AdminMenuKey[])
      : []),
    ...(hasPerm('integrations.manage') || hasPerm('integrations.payment.manage') || hasPerm('integrations.smtp.manage')
      ? (['integrations_center'] as AdminMenuKey[])
      : []),
    ...(hasPerm('security.view') || hasPerm('security.manage') || hasPerm('system.health.view') || hasPerm('backups.manage')
      ? (['security_backups'] as AdminMenuKey[])
      : []),
    ...(hasPerm('developer.console') ||
    hasPerm('developer.diagnostics') ||
    hasPerm('developer.production_access') ||
    userSession.role === 'supervisor'
      ? (['developer_console'] as AdminMenuKey[])
      : []),
    ...(hasPerm('settings.view') || hasPerm('settings.manage') ? (['settings'] as AdminMenuKey[]) : []),
    ...(userSession.role === 'chairman' || userSession.role === 'supervisor' || userSession.role === 'developer' || hasPerm('dashboard.view')
      ? (['contact_messages'] as AdminMenuKey[])
      : []),
  ];

  const [activeMenu, setActiveMenu] = useState<AdminMenuKey>(
    userSession.role === 'developer' ? 'developer_console' : allowedMenus[0] || 'overview'
  );

  useEffect(() => {
    if (userSession.role === 'developer' && allowedMenus.includes('developer_console')) {
      setActiveMenu('developer_console');
    } else if (allowedMenus.length > 0 && !allowedMenus.includes(activeMenu)) {
      setActiveMenu(allowedMenus[0]);
    }
  }, [userSession.role, userSession.user_id]);

  const currentUnitId = userSession.administrative_unit_id;
  const isSuperOrUpazila = isCrossUnit;
  const isMuniRole = currentUnitId === 'unit_pabna_muni';
  const isAccountant = false;
  const isServiceOperator = userSession.role === 'secretary';
  const isMonitoringOfficer = false;

  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected app & modal controls
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [selectedAppHistory, setSelectedAppHistory] = useState<ApplicationApproval[]>([]);
  const [assignStaffId, setAssignStaffId] = useState<string>('');
  const [reviewNote, setReviewNote] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [showCorrectionInput, setShowCorrectionInput] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Secretary draft editing & preview state
  const [editingDraftMode, setEditingDraftMode] = useState(false);
  const [draftApplicantName, setDraftApplicantName] = useState('');
  const [draftFatherName, setDraftFatherName] = useState('');
  const [draftMotherName, setDraftMotherName] = useState('');
  const [draftNid, setDraftNid] = useState('');
  const [draftMobile, setDraftMobile] = useState('');
  const [draftWardNo, setDraftWardNo] = useState<number>(1);
  const [draftVillage, setDraftVillage] = useState('');
  const [draftPresentAddr, setDraftPresentAddr] = useState('');
  const [draftPermanentAddr, setDraftPermanentAddr] = useState('');
  const [draftPreviewData, setDraftPreviewData] = useState<{
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
  } | null>(null);

  const [actionError, setActionError] = useState('');
  const [actionSuccessMessage, setActionSuccessMessage] = useState('');
  const [lastIssuedInfo, setLastIssuedInfo] = useState<{
    cert: Certificate;
    verificationUrl: string;
    token: string;
  } | null>(null);

  // Officer In-Dashboard New Application Modal State (UP_SECRETARY & UP_CHAIRMAN)
  const [showNewAppModal, setShowNewAppModal] = useState(false);
  const [newAppServiceId, setNewAppServiceId] = useState<string>('srv_citizenship');
  const [newAppApplicantName, setNewAppApplicantName] = useState('');
  const [newAppApplicantNameEn, setNewAppApplicantNameEn] = useState('');
  const [newAppFatherName, setNewAppFatherName] = useState('');
  const [newAppMotherName, setNewAppMotherName] = useState('');
  const [newAppNid, setNewAppNid] = useState('');
  const [newAppMobile, setNewAppMobile] = useState('');
  const [newAppWardNo, setNewAppWardNo] = useState<number>(1);
  const [newAppVillage, setNewAppVillage] = useState('');
  const [newAppPostOffice, setNewAppPostOffice] = useState('');
  const [newAppPresentAddr, setNewAppPresentAddr] = useState('');
  const [newAppPermanentAddr, setNewAppPermanentAddr] = useState('');
  const [newAppMarkPaid, setNewAppMarkPaid] = useState(true);
  const [newAppHeirs, setNewAppHeirs] = useState<
    Array<{ sl: number; name: string; dob: string; age: number; relation: string }>
  >([{ sl: 1, name: '', dob: '০১-০১-১৯৯৫', age: 30, relation: 'নিজ' }]);
  const [newAppDocName, setNewAppDocName] = useState('');
  const [newAppDocBase64, setNewAppDocBase64] = useState('');
  const [newAppDocMime, setNewAppDocMime] = useState('application/pdf');
  const [correctionResponseNote, setCorrectionResponseNote] = useState('');

  // Notifications drawer
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<CitizenNotification[]>([]);

  // Live server datasets
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [applications, setApplications] = useState<Application[]>(() =>
    storage.getApplications(isSuperOrUpazila ? undefined : currentUnitId)
  );
  const [holdingTaxes, setHoldingTaxes] = useState<HoldingTaxRecord[]>([]);
  const [tradeLicenses, setTradeLicenses] = useState<TradeLicenseRecord[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [wardsDepts, setWardsDepts] = useState<WardOrDepartment[]>([]);
  const [events, setEvents] = useState<CertificateEvent[]>([]);
  const [verificationLogs, setVerificationLogs] = useState<CertificateVerificationLog[]>([]);
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [inquiries, setInquiries] = useState<ContactInquiry[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermissionEntry[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [monitoringObservations, setMonitoringObservations] = useState<MonitoringObservation[]>([]);
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
  const [complaints, setComplaints] = useState<EscalatedComplaint[]>([]);
  const [developerDiagnostics, setDeveloperDiagnostics] = useState<DeveloperDiagnosticsResponse | null>(null);
  const [envDiagnostics, setEnvDiagnostics] = useState<SanitizedEnvironmentDiagnostics | null>(null);
  const [developerAccessRequests, setDeveloperAccessRequests] = useState<DeveloperAccessRequest[]>([]);

  // Monitoring observation creation state
  const [obsUnitId, setObsUnitId] = useState<string>('unit_goyeshpur');
  const [obsSeverity, setObsSeverity] = useState<'info' | 'warning' | 'critical' | 'overdue'>('warning');
  const [obsAppId, setObsAppId] = useState<string>('');
  const [obsText, setObsText] = useState<string>('');
  const [obsBusy, setObsBusy] = useState(false);

  // Escalated complaint form & resolution state
  const [cmpUnitId, setCmpUnitId] = useState<string>('unit_goyeshpur');
  const [cmpAppId, setCmpAppId] = useState<string>('');
  const [cmpSubject, setCmpSubject] = useState<string>('');
  const [cmpDetails, setCmpDetails] = useState<string>('');
  const [cmpBusy, setCmpBusy] = useState(false);

  // Developer console form state
  const [devReqScope, setDevReqScope] = useState<string>('production_deployment');
  const [devReqReason, setDevReqReason] = useState<string>('');
  const [devReqMinutes, setDevReqMinutes] = useState<number>(30);
  const [devDeployEnv, setDevDeployEnv] = useState<'staging' | 'production'>('staging');
  const [devDeployTag, setDevDeployTag] = useState<string>('v2.5.0-gov');
  const [devDeploySummary, setDevDeploySummary] = useState<string>('');
  const [devBusy, setDevBusy] = useState(false);

  const effectiveUnitScope = isSuperOrUpazila
    ? selectedUnitFilter !== 'all'
      ? selectedUnitFilter
      : undefined
    : currentUnitId;

  const unit = institutions.find((i) => i.id === (effectiveUnitScope || currentUnitId)) || institutions[0];

  const refreshServerData = useCallback(async () => {
    if (!userSession.token) return;
    const tok = userSession.token;
    try {
      api
        .getMe(tok)
        .then((meRes) => {
          if (meRes?.session?.permissions) {
            setLivePermissions(meRes.session.permissions);
          }
        })
        .catch(() => {});

      const [
        statsData,
        appsData,
        auditData,
        tplData,
        htData,
        tlData,
        noticeData,
        staffData,
        wdData,
        notifData,
        permData,
        sysData,
        obsData,
        refundData,
        complaintsData,
        devDiagData,
        devReqsData,
        envDiagData,
      ] = await Promise.all([
        hasPerm('dashboard.view') ? api.getDashboardStats(tok, effectiveUnitScope).catch(() => null) : Promise.resolve(null),
        hasPerm('applications.view') ? api.listApplications(tok, effectiveUnitScope).catch(() => []) : Promise.resolve([]),
        hasPerm('audit_logs.view')
          ? api.getAuditLogs(tok, effectiveUnitScope).catch(() => ({ events: [], verification_logs: [], approvals: [] }))
          : Promise.resolve({ events: [], verification_logs: [], approvals: [] }),
        api.getCertificateTemplates().catch(() => []),
        hasPerm('payments.view') ? api.listHoldingTaxes(effectiveUnitScope, tok).catch(() => []) : Promise.resolve([]),
        hasPerm('payments.view') || hasPerm('services.view')
          ? api.listTradeLicenses(effectiveUnitScope, tok).catch(() => [])
          : Promise.resolve([]),
        api.listNotices(effectiveUnitScope).catch(() => []),
        hasPerm('employees.view') || hasPerm('applications.assign')
          ? api.listStaff(tok, effectiveUnitScope).catch(() => [])
          : Promise.resolve([]),
        hasPerm('employees.view') || hasPerm('services.view') || hasPerm('dashboard.view')
          ? api.listWardsDepartments(tok, effectiveUnitScope).catch(() => [])
          : Promise.resolve([]),
        api.getNotifications({ token: tok }).catch(() => []),
        hasPerm('roles.manage') || hasPerm('settings.view')
          ? api.listRolePermissions(tok).catch(() => [])
          : Promise.resolve([]),
        hasPerm('settings.view') ? api.getSystemSettings(tok).catch(() => null) : Promise.resolve(null),
        hasPerm('monitoring.observe') || hasPerm('audit_logs.view')
          ? api.listMonitoringObservations(tok, effectiveUnitScope).catch(() => [])
          : Promise.resolve([]),
        hasPerm('payments.view_reports') || hasPerm('payments.request_refund') || hasPerm('payments.approve_refund')
          ? api.listRefundRequests(tok, effectiveUnitScope).catch(() => [])
          : Promise.resolve([]),
        hasPerm('complaints.view') || hasPerm('complaints.manage')
          ? api.listComplaints(tok, effectiveUnitScope).catch(() => [])
          : Promise.resolve([]),
        hasPerm('developer.diagnostics') || hasPerm('developer.console')
          ? api.getDeveloperDiagnostics(tok).catch(() => null)
          : Promise.resolve(null),
        hasPerm('developer.production_access') || hasPerm('roles.manage') || userSession.role === 'supervisor'
          ? api.listDeveloperAccessRequests(tok).catch(() => [])
          : Promise.resolve([]),
        api.getAdminEnvironmentDiagnostics(tok).catch(() => null),
      ]);

      setStats(statsData);
      setApplications(appsData);
      setEvents(auditData.events);
      setVerificationLogs(auditData.verification_logs);
      setTemplates(tplData);
      setHoldingTaxes(htData);
      setTradeLicenses(tlData);
      setNotices(noticeData);
      setStaffMembers(staffData);
      setWardsDepts(wdData);
      setNotifications(notifData);
      setRolePermissions(permData);
      setSystemSettings(sysData);
      setMonitoringObservations(obsData);
      setRefundRequests(refundData);
      setComplaints(complaintsData);
      setDeveloperDiagnostics(devDiagData);
      setDeveloperAccessRequests(devReqsData);
      setEnvDiagnostics(envDiagData);

      if (isSuperOrUpazila) {
        api.listContactInquiries(tok).then(setInquiries).catch(() => {});
      } else {
        setInquiries([]);
      }
      if (onRefreshPlatformData) {
        await onRefreshPlatformData();
      }
    } catch {
      setApplications(storage.getApplications(effectiveUnitScope));
    }
  }, [userSession.token, userSession.role, effectiveUnitScope, isSuperOrUpazila, hasPerm]);

  useEffect(() => {
    refreshServerData();
  }, [refreshServerData]);

  const handleCreateObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userSession.token || !obsText.trim()) return;
    setObsBusy(true);
    setActionError('');
    try {
      await api.createMonitoringObservation(userSession.token, {
        administrative_unit_id: obsUnitId,
        application_id: obsAppId.trim() || null,
        observation_bn: obsText.trim(),
        severity: obsSeverity,
      });
      setObsText('');
      setObsAppId('');
      setActionSuccessMessage('উপজেলা মনিটরিং পর্যবেক্ষণ সফলভাবে সংরক্ষিত হয়েছে।');
      await refreshServerData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'পর্যবেক্ষণ সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setObsBusy(false);
    }
  };

  const handleCreateComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userSession.token || !cmpSubject.trim() || !cmpDetails.trim()) return;
    setCmpBusy(true);
    setActionError('');
    try {
      await api.createComplaint(userSession.token, {
        administrative_unit_id: isSuperOrUpazila ? cmpUnitId : currentUnitId || cmpUnitId,
        application_id: cmpAppId.trim() || null,
        subject_bn: cmpSubject.trim(),
        details_bn: cmpDetails.trim(),
      });
      setCmpSubject('');
      setCmpDetails('');
      setCmpAppId('');
      setActionSuccessMessage('অভিযোগ / এস্কেলেশন সফলভাবে নিবন্ধিত হয়েছে।');
      await refreshServerData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'অভিযোগ নিবন্ধন ব্যর্থ হয়েছে।');
    } finally {
      setCmpBusy(false);
    }
  };

  const handleUpdateComplaintStatus = async (
    c: EscalatedComplaint,
    status: EscalatedComplaint['status'],
    note?: string
  ) => {
    if (!userSession.token) return;
    setActionError('');
    try {
      await api.updateComplaint(userSession.token, c.id, {
        status,
        forwarded_to_unit_id: status === 'forwarded' ? c.administrative_unit_id : c.forwarded_to_unit_id,
        resolution_note_bn: note || c.resolution_note_bn || `অবস্থা হালনাগাদ: ${status}`,
      });
      setActionSuccessMessage('অভিযোগের অবস্থা হালনাগাদ করা হয়েছে।');
      await refreshServerData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'অভিযোগ হালনাগাদ ব্যর্থ হয়েছে।');
    }
  };

  const handleCreateDevAccessRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userSession.token || !devReqReason.trim()) return;
    setDevBusy(true);
    setActionError('');
    try {
      await api.createDeveloperAccessRequest(userSession.token, {
        scope: devReqScope,
        reason_bn: devReqReason.trim(),
        duration_minutes: devReqMinutes,
      });
      setDevReqReason('');
      setActionSuccessMessage('প্রোডাকশন অ্যাক্সেস অনুরোধ সুপার অ্যাডমিনের অনুমোদনের জন্য প্রেরিত হয়েছে।');
      await refreshServerData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'প্রোডাকশন অ্যাক্সেস অনুরোধ ব্যর্থ হয়েছে।');
    } finally {
      setDevBusy(false);
    }
  };

  const handleDecideDevAccessRequest = async (
    reqId: string,
    decision: 'approved' | 'rejected' | 'revoked'
  ) => {
    if (!userSession.token) return;
    setActionError('');
    try {
      await api.decideDeveloperAccessRequest(userSession.token, reqId, decision);
      setActionSuccessMessage(`ডেভেলপার প্রোডাকশন অ্যাক্সেস অনুরোধ ${decision} করা হয়েছে।`);
      await refreshServerData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'সিদ্ধান্ত সংরক্ষণ ব্যর্থ হয়েছে।');
    }
  };

  const handleRecordDeployment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userSession.token || !devDeploySummary.trim()) return;
    setDevBusy(true);
    setActionError('');
    try {
      const rec = await api.recordDeveloperDeployment(userSession.token, {
        environment: devDeployEnv,
        version_tag: devDeployTag.trim() || 'v2.5.0',
        change_summary_bn: devDeploySummary.trim(),
      });
      setDevDeploySummary('');
      setActionSuccessMessage(
        `${rec.environment.toUpperCase()} ডিপ্লয়মেন্ট (${rec.version_tag}) সফলভাবে অডিট ট্রেইলে রেকর্ড হয়েছে।`
      );
      await refreshServerData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'ডিপ্লয়মেন্ট রেকর্ড ব্যর্থ হয়েছে।');
    } finally {
      setDevBusy(false);
    }
  };

  const openApplicationModal = async (app: Application) => {
    setSelectedApp(app);
    setReviewNote('');
    setCorrectionReason('');
    setShowCorrectionInput(false);
    setExpiresInDays('');
    setAssignStaffId(app.assigned_officer_id || '');
    setSelectedAppHistory([]);
    setEditingDraftMode(false);
    setDraftPreviewData(null);
    setDraftApplicantName(app.applicant_name_bn || '');
    setDraftFatherName(app.father_name_bn || '');
    setDraftMotherName(app.mother_name_bn || '');
    setDraftNid(app.nid_or_birth_reg || '');
    setDraftMobile(app.mobile || '');
    setDraftWardNo(app.ward_no || 1);
    setDraftVillage(app.village_or_area_bn || '');
    setDraftPresentAddr(app.present_address_bn || '');
    setDraftPermanentAddr(app.permanent_address_bn || '');

    if (userSession.token) {
      try {
        const [fullApp, hist] = await Promise.all([
          api.getApplicationByTracking(app.id, userSession.token),
          api.getApplicationHistory(userSession.token, app.id).catch(() => ({ approvals: [], events: [] })),
        ]);
        setSelectedApp(fullApp);
        setSelectedAppHistory(hist.approvals || []);
        setDraftApplicantName(fullApp.applicant_name_bn || '');
        setDraftFatherName(fullApp.father_name_bn || '');
        setDraftMotherName(fullApp.mother_name_bn || '');
        setDraftNid(fullApp.nid_or_birth_reg || '');
        setDraftMobile(fullApp.mobile || '');
        setDraftWardNo(fullApp.ward_no || 1);
        setDraftVillage(fullApp.village_or_area_bn || '');
        setDraftPresentAddr(fullApp.present_address_bn || '');
        setDraftPermanentAddr(fullApp.permanent_address_bn || '');
      } catch {
        // fallback uses row app
      }
    }
  };

  const handleSaveSecretaryDraftOrSubmit = async (submitToChairman: boolean) => {
    if (!selectedApp || !userSession.token) return;
    setSubmitting(true);
    setActionError('');
    try {
      const updated = await api.updateApplicationDraft(userSession.token, selectedApp.id, {
        applicant_name_bn: draftApplicantName.trim(),
        father_name_bn: draftFatherName.trim(),
        mother_name_bn: draftMotherName.trim(),
        nid_or_birth_reg: draftNid.trim(),
        mobile: draftMobile.trim(),
        ward_no: Number(draftWardNo) || 1,
        village_or_area_bn: draftVillage.trim(),
        present_address_bn: draftPresentAddr.trim(),
        permanent_address_bn: draftPermanentAddr.trim(),
        save_as_draft: !submitToChairman,
        submit_to_chairman: submitToChairman,
        secretary_note: reviewNote.trim() || undefined,
      });
      setSelectedApp(updated);
      setEditingDraftMode(false);
      setActionSuccessMessage(
        submitToChairman
          ? `আবেদন ${updated.tracking_no} যাচাই সম্পন্ন করে চেয়ারম্যানের চূড়ান্ত অনুমোদনের জন্য দাখিল করা হয়েছে।`
          : `আবেদন ${updated.tracking_no} খসড়া (Draft) হিসেবে সংরক্ষিত হয়েছে।`
      );
      if (submitToChairman) {
        setSelectedApp(null);
      }
      await refreshServerData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'খসড়া সংরক্ষণ বা প্রেরণ ব্যর্থ হয়েছে।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubmitCorrection = async () => {
    if (!selectedApp || !userSession.token) return;
    setSubmitting(true);
    setActionError('');
    try {
      const updated = await api.resubmitApplication(
        selectedApp.id,
        {
          tracking_no: selectedApp.tracking_no,
          applicant_name_bn: draftApplicantName.trim() || selectedApp.applicant_name_bn,
          father_name_bn: draftFatherName.trim() || selectedApp.father_name_bn,
          mother_name_bn: draftMotherName.trim() || selectedApp.mother_name_bn,
          nid_or_birth_reg: draftNid.trim() || selectedApp.nid_or_birth_reg,
          mobile: draftMobile.trim() || selectedApp.mobile,
          ward_no: Number(draftWardNo) || selectedApp.ward_no || 1,
          village_or_area_bn: draftVillage.trim() || selectedApp.village_or_area_bn,
          present_address_bn: draftPresentAddr.trim() || selectedApp.present_address_bn,
          permanent_address_bn: draftPermanentAddr.trim() || selectedApp.permanent_address_bn,
          correction_response:
            correctionResponseNote.trim() ||
            reviewNote.trim() ||
            'চাহিত তথ্য ও কাগজপত্র সংশোধনপূর্বক পুনরায় চেয়ারম্যান মহোদয়ের অনুমোদনের জন্য দাখিল করা হলো।',
        },
        userSession.token
      );
      setCorrectionResponseNote('');
      setActionSuccessMessage(
        `আবেদন ${updated.tracking_no} সংশোধনপূর্বক পুনরায় চেয়ারম্যানের চূড়ান্ত অনুমোদনের জন্য দাখিল করা হয়েছে।`
      );
      setSelectedApp(null);
      await refreshServerData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'সংশোধনী পুনঃদাখিল ব্যর্থ হয়েছে।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateOfficerApplication = async (saveAsDraft: boolean) => {
    if (!userSession.token) return;
    if (!newAppApplicantName.trim() || !newAppMobile.trim()) {
      setActionError('আবেদনকারীর নাম (বাংলা) এবং মোবাইল নম্বর প্রদান করা আবশ্যক।');
      return;
    }
    setSubmitting(true);
    setActionError('');
    try {
      const targetUnitId = currentUnitId || unit.id;
      const selectedSrv = services.find((s) => s.id === newAppServiceId) || services[0];
      const validHeirs = newAppHeirs.filter((h) => h.name.trim());
      const created = await api.createApplication(
        {
          administrative_unit_id: targetUnitId,
          service_id: selectedSrv?.id || newAppServiceId,
          service_name_bn: selectedSrv?.name_bn,
          applicant_name_bn: newAppApplicantName.trim(),
          applicant_name_en: newAppApplicantNameEn.trim(),
          father_name_bn: newAppFatherName.trim() || 'প্রযোজ্য নয়',
          mother_name_bn: newAppMotherName.trim() || 'প্রযোজ্য নয়',
          nid_or_birth_reg: newAppNid.trim() || '19900000000000000',
          mobile: newAppMobile.trim(),
          ward_no: Number(newAppWardNo) || 1,
          village_or_area_bn: newAppVillage.trim() || unit.name_bn,
          post_office_bn: newAppPostOffice.trim() || unit.name_bn,
          present_address_bn:
            newAppPresentAddr.trim() ||
            `গ্রাম/মহল্লাঃ ${newAppVillage.trim() || unit.name_bn}, ওয়ার্ড নংঃ ${newAppWardNo}, ${unit.name_bn}`,
          permanent_address_bn:
            newAppPermanentAddr.trim() ||
            `গ্রাম/মহল্লাঃ ${newAppVillage.trim() || unit.name_bn}, ওয়ার্ড নংঃ ${newAppWardNo}, ${unit.name_bn}`,
          fee_amount: selectedSrv?.default_fee ?? 50,
          heirs: validHeirs.length > 0 ? validHeirs : undefined,
          save_as_draft: saveAsDraft,
        },
        userSession.token
      );

      if (newAppDocName.trim() && newAppDocBase64.trim()) {
        await api
          .uploadAttachment(created.id, {
            doc_type: 'nid',
            original_name: newAppDocName.trim(),
            mime_type: newAppDocMime || 'application/pdf',
            content_base64: newAppDocBase64.trim(),
          })
          .catch(() => {});
      }

      if (!saveAsDraft && newAppMarkPaid && (created.fee_amount || 0) > 0) {
        await api
          .checkoutPayment({
            applicationId: created.id,
            method: 'bkash',
            amount: created.fee_amount || 50,
          })
          .catch(() => {});
      }

      setShowNewAppModal(false);
      setNewAppApplicantName('');
      setNewAppApplicantNameEn('');
      setNewAppFatherName('');
      setNewAppMotherName('');
      setNewAppNid('');
      setNewAppMobile('');
      setNewAppDocName('');
      setNewAppDocBase64('');
      setActionSuccessMessage(
        saveAsDraft
          ? `নতুন আবেদন (${created.tracking_no}) খসড়া (Draft) হিসেবে ${unit.name_bn}-এ সংরক্ষিত হয়েছে।`
          : `নতুন আবেদন (${created.tracking_no}) সফলভাবে দাখিল হয়েছে এবং চেয়ারম্যানের অনুমোদন কিউতে যুক্ত হয়েছে।`
      );
      await refreshServerData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'নতুন আবেদন তৈরি ব্যর্থ হয়েছে।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDraftPreview = async () => {
    if (!selectedApp || !userSession.token) return;
    setSubmitting(true);
    setActionError('');
    try {
      const preview = await api.getApplicationDraftPreview(userSession.token, selectedApp.id);
      setDraftPreviewData(preview);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'খসড়া প্রিভিউ লোড করা যায়নি।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturnToSecretary = async () => {
    if (!selectedApp || !userSession.token) return;
    setSubmitting(true);
    setActionError('');
    try {
      const updated = await api.returnApplicationToSecretary(
        userSession.token,
        selectedApp.id,
        reviewNote.trim() || 'পুনরায় যাচাই ও তথ্য সংশোধনের জন্য ইউপি সচিবের নিকট ফেরত পাঠানো হলো।'
      );
      setActionSuccessMessage(`আবেদন ${updated.tracking_no} পুনরায় যাচাইয়ের জন্য ইউপি সচিবের নিকট ফেরত পাঠানো হয়েছে।`);
      setSelectedApp(null);
      await refreshServerData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'সচিবের নিকট ফেরত পাঠানো ব্যর্থ হয়েছে।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignOfficer = async () => {
    if (!selectedApp || !userSession.token || !assignStaffId) return;
    setSubmitting(true);
    setActionError('');
    try {
      const updated = await api.assignApplicationOfficer(userSession.token, selectedApp.id, {
        staff_id: assignStaffId,
      });
      setSelectedApp(updated);
      setActionSuccessMessage(`আবেদন ${updated.tracking_no} এ কর্মকর্তা (${updated.assigned_officer}) নিযুক্ত হয়েছেন।`);
      await refreshServerData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'কর্মকর্তা নিয়োগ ব্যর্থ হয়েছে।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestCorrection = async () => {
    if (!selectedApp || !userSession.token) return;
    setSubmitting(true);
    setActionError('');
    try {
      await api.requestApplicationCorrection(
        userSession.token,
        selectedApp.id,
        correctionReason.trim() || reviewNote.trim() || 'অনুগ্রহ করে সঠিক তথ্য ও স্পষ্ট কাগজপত্র পুনঃদাখিল করুন।'
      );
      setActionSuccessMessage(`আবেদন ${selectedApp.tracking_no} সংশোধনের জন্য নাগরিকের নিকট ফেরত পাঠানো হয়েছে।`);
      setSelectedApp(null);
      await refreshServerData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'সংশোধন অনুরোধ ব্যর্থ হয়েছে।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (
    newStatus: 'under_verification' | 'forwarded_for_approval' | 'rejected' | 'certificate_issued'
  ) => {
    if (!selectedApp) return;
    setActionError('');

    if (!userSession.token) {
      setActionError('অফিসার সেশন টোকেন পাওয়া যায়নি। অনুগ্রহ করে পুনরায় লগইন করুন।');
      return;
    }

    if (newStatus === 'rejected' && !reviewNote.trim()) {
      setActionError('আবেদন বাতিলের ক্ষেত্রে দাপ্তরিক যাচাই মন্তব্য ঘরে সুনির্দিষ্ট কারণ উল্লেখ করা আবশ্যক।');
      return;
    }

    setSubmitting(true);
    try {
      if (newStatus === 'certificate_issued') {
        const parsedDays = expiresInDays.trim() ? parseInt(expiresInDays.trim(), 10) : undefined;
        const result = await api.finalApproveAndIssue(userSession.token, selectedApp.id, {
          notes: reviewNote || undefined,
          expires_in_days: Number.isFinite(parsedDays) ? parsedDays : undefined,
        });

        const url = result.verification_url || result.certificate.verification_url;
        const extractedToken = url.includes('/verify/') ? url.split('/verify/')[1] : '';

        setActionSuccessMessage(
          result.already_issued
            ? `এই আবেদনের বিপরীতে ইতোপূর্বেই সনদ ইস্যু হয়েছে (সনদ নং: ${result.certificate.certificate_no})`
            : `চূড়ান্ত অনুমোদন, স্বয়ংক্রিয় QR ও PDF সনদ ইস্যু সম্পন্ন! (সনদ নং: ${result.certificate.certificate_no})`
        );

        if (extractedToken && !extractedToken.includes('[')) {
          setLastIssuedInfo({
            cert: result.certificate,
            verificationUrl: url,
            token: extractedToken,
          });
        }

        setSelectedApp(null);
        await refreshServerData();
      } else {
        await api.updateApplicationStatus(
          userSession.token,
          selectedApp.id,
          newStatus,
          reviewNote || `স্ট্যাটাস পরিবর্তন: ${newStatus}`
        );
        setActionSuccessMessage('আবেদনের স্ট্যাটাস সফলভাবে আপডেট করা হয়েছে।');
        setSelectedApp(null);
        await refreshServerData();
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'কার্যক্রম সম্পন্ন করা যায়নি।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPdf = async (cert: Certificate) => {
    setActionError('');
    try {
      const { blob, filename } = await api.fetchCertificatePdfBlob(cert.id, {
        authToken: userSession.token,
      });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2500);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'PDF ডাউনলোড ব্যর্থ হয়েছে।');
    }
  };

  const filteredApps = applications.filter((app) => {
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      app.tracking_no.toLowerCase().includes(q) ||
      app.applicant_name_bn.toLowerCase().includes(q) ||
      app.service_name_bn.toLowerCase().includes(q) ||
      (app.assigned_officer || '').toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  // Live aggregated metrics (zero fake fallback numbers)
  const totalApps = stats?.total_applications ?? applications.length;
  const pendingApps =
    stats?.pending_applications ??
    applications.filter((a) =>
      ['pending_payment', 'paid', 'under_verification', 'correction_required', 'forwarded_for_approval'].includes(a.status)
    ).length;
  const approvedApps =
    stats?.approved_applications ??
    applications.filter((a) => a.status === 'approved' || a.status === 'certificate_issued').length;
  const totalRevenue =
    stats?.total_revenue ??
    applications.filter((a) => a.payment_status === 'paid').reduce((sum, a) => sum + (a.fee_amount || 0), 0);

  const monthlyStats = stats?.monthly_stats || [];
  const maxMonthlyCount = Math.max(1, ...monthlyStats.map((m) => m.count));

  const menuDefinitions: Array<{
    key: AdminMenuKey;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
  }> = [
    { key: 'overview', label: 'ড্যাশবোর্ড', icon: LayoutDashboard },
    { key: 'applications', label: 'আবেদনসমূহ', icon: FileText, badge: pendingApps },
    { key: 'certificates', label: 'সনদ ব্যবস্থাপনা', icon: Award },
    { key: 'monitoring', label: 'মনিটরিং ও SLA', icon: Eye, badge: monitoringObservations.length },
    { key: 'complaints', label: 'অভিযোগ ও এস্কেলেশন', icon: MessageSquare, badge: complaints.length },
    { key: 'payments', label: 'পেমেন্ট ও রাজস্ব', icon: CreditCard },
    { key: 'holding_tax', label: 'হোল্ডিং ট্যাক্স', icon: Home },
    { key: 'trade_license', label: 'ট্রেড লাইসেন্স', icon: Store },
    { key: 'staff', label: 'কর্মকর্তা ও কর্মচারী', icon: Users },
    { key: 'wards_depts', label: isMuniRole ? 'ওয়ার্ড ও বিভাগ' : 'ওয়ার্ড ব্যবস্থাপনা', icon: Layers },
    { key: 'notices', label: 'নোটিশ বোর্ড', icon: Megaphone },
    { key: 'services_config', label: 'সেবা ও ফি কনফিগ', icon: Sliders },
    { key: 'reports', label: 'রিপোর্ট ও অডিট', icon: BarChart3 },
    { key: 'role_management', label: 'রোল ও RBAC পারমিশন', icon: Shield },
    { key: 'cms_builder', label: 'ওয়েবসাইট সিএমএস ও পেজ বিল্ডার', icon: Globe },
    { key: 'ai_seo_studio', label: 'AI SEO ও কনটেন্ট স্টুডিও', icon: Sparkles },
    { key: 'integrations_center', label: 'ইন্টিগ্রেশন ও সনদ ডিজাইন', icon: KeyRound },
    { key: 'security_backups', label: 'নিরাপত্তা (SOC) ও ব্যাকআপ', icon: ShieldAlert },
    { key: 'developer_console', label: 'ডেভেলপার কনসোল', icon: Terminal, badge: developerAccessRequests.filter((r) => r.status === 'pending').length },
    { key: 'contact_messages', label: 'যোগাযোগ বার্তা', icon: MessageSquare, badge: inquiries.length },
    { key: 'settings', label: 'সেটিংস ও ব্যাকআপ', icon: Settings },
  ];

  const visibleMenus = menuDefinitions.filter((m) => allowedMenus.includes(m.key));

  const appColumns: TableColumn<Application>[] = [
    {
      key: 'tracking_no',
      header: 'ট্র্যাকিং নং',
      minWidth: '125px',
      stickyLeft: true,
      render: (app) => (
        <span className="font-mono font-bold text-emerald-900">{app.tracking_no}</span>
      ),
    },
    {
      key: 'created_at',
      header: 'আবেদনের সময় ও তারিখ',
      minWidth: '150px',
      render: (app) => (
        <div className="text-[11px] font-mono text-slate-700">
          {new Date(app.created_at || Date.now()).toLocaleString('bn-BD', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      ),
    },
    {
      key: 'applicant',
      header: 'আবেদনকারী',
      minWidth: '145px',
      render: (app) => (
        <div>
          <div className="font-semibold text-slate-900">{app.applicant_name_bn}</div>
          <div className="text-[10px] text-slate-500">পিতা: {app.father_name_bn}</div>
        </div>
      ),
    },
    {
      key: 'service',
      header: 'সেবা',
      minWidth: '145px',
      render: (app) => <span className="text-slate-800 font-medium">{app.service_name_bn}</span>,
    },
    {
      key: 'unit',
      header: 'প্রতিষ্ঠান ও ওয়ার্ড',
      minWidth: '155px',
      render: (app) => {
        const u = institutions.find((i) => i.id === app.administrative_unit_id);
        return (
          <div>
            <div className="text-slate-800">{u?.name_bn || app.administrative_unit_id}</div>
            <div className="text-[10px] text-slate-500">{app.ward_no} নং ওয়ার্ড</div>
          </div>
        );
      },
    },
    {
      key: 'officer',
      header: 'দায়িত্বপ্রাপ্ত',
      minWidth: '130px',
      render: (app) => (
        <span className="text-slate-600">{app.assigned_officer || 'অনির্ধারিত'}</span>
      ),
    },
    {
      key: 'fee',
      header: 'ফি',
      align: 'right',
      minWidth: '80px',
      render: (app) => <span className="font-mono font-bold">৳{app.fee_amount}</span>,
    },
    {
      key: 'status',
      header: 'অবস্থা',
      align: 'center',
      minWidth: '130px',
      render: (app) => {
        const badge = APP_STATUS_BADGE[app.status] || { label: app.status, cls: 'bg-slate-100 text-slate-800' };
        return (
          <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${badge.cls}`}>
            {badge.label}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'পদক্ষেপ',
      align: 'right',
      minWidth: '140px',
      hideInMobileCard: true,
      render: (app) => (
        <button
          type="button"
          onClick={() => openApplicationModal(app)}
          className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-lg text-[11px] transition-colors shadow-2xs"
        >
          পর্যালোচনা ও পদক্ষেপ
        </button>
      ),
    },
  ];

  const instBreakdownCols: TableColumn<DashboardStatsResponse['institution_breakdown'][number]>[] = [
    {
      key: 'name',
      header: 'প্রতিষ্ঠানের নাম',
      minWidth: '170px',
      stickyLeft: true,
      render: (r) => <span className="font-bold text-slate-900">{r.name_bn}</span>,
    },
    {
      key: 'type',
      header: 'ধরন',
      minWidth: '110px',
      render: (r) => (
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            r.type === 'municipality' ? 'bg-teal-100 text-teal-800' : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {r.type === 'municipality' ? 'পৌরসভা' : 'ইউনিয়ন পরিষদ'}
        </span>
      ),
    },
    {
      key: 'apps',
      header: 'মোট আবেদন',
      align: 'right',
      minWidth: '90px',
      render: (r) => <span className="font-mono font-bold">{r.applications}</span>,
    },
    {
      key: 'pending',
      header: 'অপেক্ষমাণ',
      align: 'right',
      minWidth: '85px',
      render: (r) => <span className="font-mono font-bold text-amber-700">{r.pending ?? 0}</span>,
    },
    {
      key: 'overdue',
      header: 'মেয়াদোত্তীর্ণ (SLA)',
      align: 'right',
      minWidth: '105px',
      render: (r) => (
        <span className={`font-mono font-bold ${(r.overdue ?? 0) > 0 ? 'text-red-700' : 'text-slate-600'}`}>
          {r.overdue ?? 0}
        </span>
      ),
    },
    {
      key: 'avg_days',
      header: 'গড় সময় (দিন)',
      align: 'right',
      minWidth: '95px',
      render: (r) => <span className="font-mono">{r.avg_days ?? 2} দিন</span>,
    },
    {
      key: 'certs',
      header: 'ইস্যুকৃত সনদ',
      align: 'right',
      minWidth: '95px',
      render: (r) => <span className="font-mono font-bold text-emerald-800">{r.certificates}</span>,
    },
    {
      key: 'rev',
      header: 'সংগৃহীত ফি',
      align: 'right',
      minWidth: '100px',
      render: (r) => <span className="font-mono font-bold">৳{r.revenue}</span>,
    },
  ];

  const unitStaffOptions = staffMembers.filter(
    (s) => !selectedApp || s.administrative_unit_id === selectedApp.administrative_unit_id
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="no-print w-full md:w-64 bg-emerald-950 text-slate-300 flex flex-col justify-between shrink-0 border-r border-emerald-900">
        <div>
          <div className="p-5 border-b border-emerald-900/80 bg-emerald-900/40">
            <div className="flex items-center gap-2 text-white">
              <Building2 className="w-5 h-5 text-emerald-400" />
              <div>
                <h2 className="text-sm font-bold leading-tight">PottoyonBD</h2>
                <p className="text-[11px] text-emerald-300 font-medium">প্রশাসনিক ড্যাশবোর্ড</p>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-emerald-800/60 text-xs">
              <span className="text-slate-400 block text-[10px]">দায়িত্বপ্রাপ্ত ইউনিট:</span>
              <span className="font-bold text-white block truncate">
                {isSuperOrUpazila ? 'পাবনা সদর (সকল ইউনিট)' : unit.name_bn}
              </span>
            </div>
          </div>

          <nav className="p-3 space-y-1 text-xs font-semibold flex md:block overflow-x-auto gap-1">
            {visibleMenus.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveMenu(item.key)}
                  className={`md:w-full shrink-0 flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl transition-colors whitespace-nowrap ${
                    activeMenu === item.key
                      ? 'bg-emerald-800 text-white font-bold shadow-xs'
                      : 'hover:bg-emerald-900/60 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className="bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden md:flex p-4 border-t border-emerald-900 bg-emerald-950/60 items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-sm shrink-0">
              {userSession.name?.slice(0, 1) || 'ইউ'}
            </div>
            <div className="text-xs truncate">
              <span className="font-bold text-white block truncate">{userSession.name}</span>
              <span className="text-emerald-400 block text-[10px] truncate">{userSession.title_bn}</span>
            </div>
          </div>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title="লগআউট"
              className="p-2 rounded-lg hover:bg-emerald-900 text-emerald-300 hover:text-white shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area (min-w-0 prevents flex child horizontal overflow on mobile!) */}
      <main className="flex-1 min-w-0 max-w-full overflow-x-hidden overflow-y-auto">
        {/* Top Navbar */}
        <div className="no-print bg-white px-4 sm:px-6 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
              {isSuperOrUpazila ? 'সেন্ট্রাল কন্ট্রোল প্যানেল' : unit.name_bn}
            </h1>
            {isMuniRole && (
              <span className="text-[11px] bg-teal-100 text-teal-800 font-bold px-2.5 py-0.5 rounded-full">
                ১৫টি ওয়ার্ড • পৌর প্রশাসন
              </span>
            )}
            {userSession.assigned_wards && userSession.assigned_wards.length > 0 && (
              <span className="text-[11px] bg-blue-100 text-blue-800 font-bold px-2.5 py-0.5 rounded-full">
                ওয়ার্ড: {userSession.assigned_wards.join(', ')} নং
              </span>
            )}
            {userSession.assigned_departments && userSession.assigned_departments.length > 0 && (
              <span className="text-[11px] bg-indigo-100 text-indigo-800 font-bold px-2.5 py-0.5 rounded-full">
                বিভাগ: {userSession.assigned_departments.join(', ')}
              </span>
            )}
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                canAnyApproval
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {canAnyApproval ? 'অনুমোদন ক্ষমতাপ্রাপ্ত' : 'যাচাই / পরিচালনা / পর্যবেক্ষণ'}
            </span>
            {userSession.roles && userSession.roles.length > 1 && (
              <span className="text-[11px] bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-full">
                মাল্টি-রোল ({userSession.roles.length})
              </span>
            )}
            {isSuperOrUpazila && (
              <select
                value={selectedUnitFilter}
                onChange={(e) => setSelectedUnitFilter(e.target.value)}
                className="ml-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
              >
                <option value="all">সকল প্রতিষ্ঠান (১০ ইউপি + ১ পৌরসভা)</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name_bn}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2.5 text-xs relative">
            {(isServiceOperator || hasPerm('applications.create')) && (
              <button
                type="button"
                onClick={() => setShowNewAppModal(true)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>নতুন আবেদন তৈরি</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-600 relative"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              {notifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-11 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-40 p-3 space-y-2 max-h-80 overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold text-slate-900">সাম্প্রতিক নোটিফিকেশন ({notifications.length})</span>
                  <button type="button" onClick={() => setNotifOpen(false)} className="text-slate-400 font-bold">
                    ✕
                  </button>
                </div>
                {notifications.slice(0, 8).map((n) => (
                  <div key={n.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
                    <div className="font-bold text-emerald-900 text-[11px]">{n.title_bn}</div>
                    <p className="text-[11px] text-slate-600">{n.message_bn}</p>
                  </div>
                ))}
                {notifications.length === 0 && (
                  <p className="text-center text-slate-400 py-4">কোনো নোটিফিকেশন নেই।</p>
                )}
              </div>
            )}

            <div className="text-right">
              <span className="font-bold text-slate-800 block">{userSession.name}</span>
              <span className="text-slate-500 block text-[11px]">{userSession.title_bn}</span>
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">লগআউট</span>
              </button>
            )}
          </div>
        </div>

        {/* Feedback Banners */}
        {actionSuccessMessage && (
          <div className="mx-4 sm:mx-6 mt-4 p-4 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-semibold flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{actionSuccessMessage}</span>
            </div>
            <button type="button" onClick={() => setActionSuccessMessage('')} className="text-emerald-700 font-bold">
              ✕
            </button>
          </div>
        )}

        {lastIssuedInfo && (
          <div className="mx-4 sm:mx-6 mt-4 p-4 bg-white border-2 border-emerald-500 rounded-2xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-3">
              {lastIssuedInfo.cert.qr_data_url && (
                <img
                  src={lastIssuedInfo.cert.qr_data_url}
                  alt="Issued QR"
                  className="w-16 h-16 border border-slate-200 rounded-lg p-1 bg-white shrink-0"
                />
              )}
              <div className="space-y-1">
                <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-emerald-700" />
                  <span>স্বয়ংক্রিয় QR ও PDF সনদ প্রস্তুত (সনদ নং: {lastIssuedInfo.cert.certificate_no})</span>
                </div>
                <div className="font-mono text-[11px] text-slate-600 break-all">
                  {lastIssuedInfo.verificationUrl}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onNavigateVerify && (
                <button
                  type="button"
                  onClick={() => onNavigateVerify(lastIssuedInfo.token)}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-2 rounded-lg flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>যাচাই পাতায় দেখুন</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDownloadPdf(lastIssuedInfo.cert)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-2 rounded-lg flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
              <button type="button" onClick={() => setLastIssuedInfo(null)} className="text-slate-400 px-2 py-1">
                ✕
              </button>
            </div>
          </div>
        )}

        {actionError && (
          <div className="mx-4 sm:mx-6 mt-4 p-4 bg-red-50 border border-red-300 text-red-900 rounded-xl text-xs font-semibold flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
              <span>{actionError}</span>
            </div>
            <button type="button" onClick={() => setActionError('')} className="text-red-700 font-bold">
              ✕
            </button>
          </div>
        )}

        {/* OVERVIEW TAB */}
        {activeMenu === 'overview' && (
          <div className="p-4 sm:p-6 space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 tabular-nums">
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-2">
                  <span>মোট আবেদন</span>
                  <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
                    <FileText className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 font-mono">{totalApps}</div>
                <span className="text-[11px] text-slate-500 font-medium mt-1 block">
                  সক্রিয় ডাটাবেজ রেকর্ড
                </span>
              </div>

              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-2">
                  <span>অপেক্ষমাণ / চলমান</span>
                  <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-amber-700 font-mono">{pendingApps}</div>
                <span className="text-[11px] text-slate-500 font-medium mt-1 block">
                  যাচাই ও অনুমোদন অপেক্ষায়
                </span>
              </div>

              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-2">
                  <span>অনুমোদিত ও ইস্যু</span>
                  <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-emerald-800 font-mono">{approvedApps}</div>
                <span className="text-[11px] text-slate-500 font-medium mt-1 block">
                  বৈধ সনদ: {stats?.valid_certificates ?? 0} টি
                </span>
              </div>

              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-2">
                  <span>সংগৃহীত রাজস্ব</span>
                  <div className="p-1.5 rounded-lg bg-purple-50 text-purple-700">
                    <CreditCard className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 font-mono">
                  ৳{totalRevenue.toLocaleString('bn-BD')}
                </div>
                <span className="text-[11px] text-emerald-700 font-semibold mt-1 block">
                  যাচাইকৃত অনলাইন পেমেন্ট
                </span>
              </div>
            </div>

            {/* Role-Specific Union Workflow Breakdown Cards for UP_CHAIRMAN & UP_SECRETARY */}
            {(userSession.role === 'chairman' || userSession.role === 'secretary') && (
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-emerald-200 shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {userSession.role === 'chairman'
                        ? `${unit.name_bn} — ইউপি চেয়ারম্যান চূড়ান্ত অনুমোদন ও আবেদন ড্যাশবোর্ড`
                        : `${unit.name_bn} — ইউপি সচিব আবেদন প্রস্তুতি ও ট্র্যাকিং ড্যাশবোর্ড`}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {userSession.role === 'chairman'
                        ? 'কেবলমাত্র নির্ধারিত ইউনিয়নের আবেদনসমূহ দেখুন, নতুন আবেদন তৈরি করুন এবং চূড়ান্ত অনুমোদন / প্রত্যাখ্যান / সংশোধন সিদ্ধান্ত প্রদান করুন'
                        : 'কেবলমাত্র নির্ধারিত ইউনিয়নের সেবা আবেদন তৈরি, খসড়া সংরক্ষণ, চেয়ারম্যানের নিকট দাখিল ও সংশোধনী জবাব প্রদান করুন'}
                    </p>
                  </div>
                  {hasPerm('applications.create') && (
                    <button
                      type="button"
                      onClick={() => setShowNewAppModal(true)}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-2xs"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>+ নতুন সনদ আবেদন তৈরি ({unit.name_bn})</span>
                    </button>
                  )}
                </div>

                {userSession.role === 'chairman' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs tabular-nums">
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('all');
                        setActiveMenu('applications');
                      }}
                      className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition-colors"
                    >
                      <span className="text-slate-500 block text-[11px]">মোট আবেদন</span>
                      <span className="text-lg font-black text-slate-900 font-mono">{applications.length}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('forwarded_for_approval');
                        setActiveMenu('applications');
                      }}
                      className="p-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-left transition-colors"
                    >
                      <span className="text-indigo-800 block text-[11px] font-semibold">পেন্ডিং অনুমোদন</span>
                      <span className="text-lg font-black text-indigo-900 font-mono">
                        {
                          applications.filter((a) =>
                            ['forwarded_for_approval', 'paid', 'under_verification'].includes(a.status)
                          ).length
                        }
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('certificate_issued');
                        setActiveMenu('applications');
                      }}
                      className="p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-left transition-colors"
                    >
                      <span className="text-emerald-800 block text-[11px] font-semibold">অনুমোদিত আবেদন</span>
                      <span className="text-lg font-black text-emerald-900 font-mono">
                        {applications.filter((a) => a.status === 'approved' || a.status === 'certificate_issued').length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('rejected');
                        setActiveMenu('applications');
                      }}
                      className="p-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-left transition-colors"
                    >
                      <span className="text-red-800 block text-[11px] font-semibold">প্রত্যাখ্যাত (Rejected)</span>
                      <span className="text-lg font-black text-red-900 font-mono">
                        {applications.filter((a) => a.status === 'rejected').length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('correction_required');
                        setActiveMenu('applications');
                      }}
                      className="p-3 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-left transition-colors"
                    >
                      <span className="text-orange-800 block text-[11px] font-semibold">সংশোধন প্রয়োজন</span>
                      <span className="text-lg font-black text-orange-900 font-mono">
                        {applications.filter((a) => a.status === 'correction_required').length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMenu('certificates')}
                      className="p-3 rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-200 text-left transition-colors"
                    >
                      <span className="text-teal-800 block text-[11px] font-semibold">ইস্যুকৃত সনদ</span>
                      <span className="text-lg font-black text-teal-900 font-mono">
                        {stats?.valid_certificates ??
                          applications.filter((a) => a.status === 'certificate_issued').length}
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs tabular-nums">
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('all');
                        setActiveMenu('applications');
                      }}
                      className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition-colors"
                    >
                      <span className="text-slate-500 block text-[11px]">মোট আবেদন</span>
                      <span className="text-lg font-black text-slate-900 font-mono">{applications.length}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('draft');
                        setActiveMenu('applications');
                      }}
                      className="p-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-left transition-colors"
                    >
                      <span className="text-slate-700 block text-[11px] font-semibold">খসড়া (Drafts)</span>
                      <span className="text-lg font-black text-slate-900 font-mono">
                        {applications.filter((a) => a.status === 'draft').length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('under_verification');
                        setActiveMenu('applications');
                      }}
                      className="p-3 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-left transition-colors"
                    >
                      <span className="text-blue-800 block text-[11px] font-semibold">দাখিলকৃত আবেদন</span>
                      <span className="text-lg font-black text-blue-900 font-mono">
                        {applications.filter((a) => a.status !== 'draft').length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('forwarded_for_approval');
                        setActiveMenu('applications');
                      }}
                      className="p-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-left transition-colors"
                    >
                      <span className="text-indigo-800 block text-[11px] font-semibold">চেয়ারম্যান অনুমোদন অপেক্ষায়</span>
                      <span className="text-lg font-black text-indigo-900 font-mono">
                        {applications.filter((a) => a.status === 'forwarded_for_approval').length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('correction_required');
                        setActiveMenu('applications');
                      }}
                      className="p-3 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-left transition-colors"
                    >
                      <span className="text-orange-800 block text-[11px] font-semibold">সংশোধন প্রয়োজন</span>
                      <span className="text-lg font-black text-orange-900 font-mono">
                        {applications.filter((a) => a.status === 'correction_required').length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('certificate_issued');
                        setActiveMenu('applications');
                      }}
                      className="p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-left transition-colors"
                    >
                      <span className="text-emerald-800 block text-[11px] font-semibold">অনুমোদিত আবেদন</span>
                      <span className="text-lg font-black text-emerald-900 font-mono">
                        {applications.filter((a) => a.status === 'approved' || a.status === 'certificate_issued').length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMenu('certificates')}
                      className="p-3 rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-200 text-left transition-colors"
                    >
                      <span className="text-teal-800 block text-[11px] font-semibold">ইস্যুকৃত সনদ</span>
                      <span className="text-lg font-black text-teal-900 font-mono">
                        {stats?.valid_certificates ??
                          applications.filter((a) => a.status === 'certificate_issued').length}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Live Monthly Chart */}
              <div className="lg:col-span-7 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between mb-5 pb-2 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">আবেদনের মাসিক পরিসংখ্যান (লাইভ ডাটা)</h3>
                  <span className="text-xs text-slate-500">মোট {totalApps}টি আবেদন</span>
                </div>

                {monthlyStats.length > 0 ? (
                  <div className="h-44 flex items-end justify-between gap-3 pt-6 px-2">
                    {monthlyStats.map((bar, i) => {
                      const pct = Math.max(12, Math.round((bar.count / maxMonthlyCount) * 100));
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                          <span className="text-[11px] font-mono font-bold text-slate-700">
                            {bar.count}
                          </span>
                          <div
                            style={{ height: `${pct}%` }}
                            className="w-full max-w-10 bg-emerald-700 group-hover:bg-emerald-600 rounded-t-md transition-all"
                          />
                          <span className="text-[11px] text-slate-600 font-semibold">{bar.month}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-44 flex items-center justify-center text-xs text-slate-400">
                    পরিসংখ্যান প্রস্তুত হচ্ছে...
                  </div>
                )}
              </div>

              {/* Administrative Summary */}
              <div className="lg:col-span-5 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                  প্রশাসনিক সংক্ষেপ
                </h3>
                <div className="space-y-2.5 text-xs tabular-nums">
                  <div className="flex justify-between p-2.5 rounded-lg bg-slate-50">
                    <span className="text-slate-500">অধিক্ষেত্র:</span>
                    <span className="font-bold text-slate-900">
                      {isSuperOrUpazila && selectedUnitFilter === 'all' ? '১১টি প্রতিষ্ঠান (সকল)' : unit.name_bn}
                    </span>
                  </div>
                  <div className="flex justify-between p-2.5 rounded-lg bg-slate-50">
                    <span className="text-slate-500">সক্রিয় ট্রেড লাইসেন্স:</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {stats?.active_trade_licenses ?? tradeLicenses.length}টি
                    </span>
                  </div>
                  <div className="flex justify-between p-2.5 rounded-lg bg-slate-50">
                    <span className="text-slate-500">বকেয়া হোল্ডিং ট্যাক্স:</span>
                    <span className="font-bold text-amber-700 font-mono">
                      ৳{stats?.holding_tax_due ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between p-2.5 rounded-lg bg-slate-50">
                    <span className="text-slate-500">ইস্যুকৃত সনদ (মোট / বাতিল):</span>
                    <span className="font-bold text-emerald-800 font-mono">
                      {stats?.total_certificates ?? 0} / {stats?.revoked_certificates ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between p-2.5 rounded-lg bg-slate-50">
                    <span className="text-slate-500">SLA অতিক্রান্ত / গড় সময়:</span>
                    <span className="font-bold text-slate-900 font-mono">
                      <span className={(stats?.overdue_applications ?? 0) > 0 ? 'text-red-700' : 'text-emerald-800'}>
                        {stats?.overdue_applications ?? 0}টি মেয়াদোত্তীর্ণ
                      </span>{' '}
                      • গড় {stats?.avg_processing_days ?? 2} দিন
                    </span>
                  </div>
                </div>

                {isServiceOperator && onApplyNewService ? (
                  <button
                    type="button"
                    onClick={() => onApplyNewService('srv_warish', currentUnitId)}
                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>নতুন নাগরিক আবেদন এন্ট্রি (Intake)</span>
                  </button>
                ) : !isAccountant && hasPerm('applications.view') ? (
                  <button
                    type="button"
                    onClick={() => setActiveMenu('applications')}
                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>{isMonitoringOfficer ? 'আবেদন ও SLA পর্যবেক্ষণ করুন' : 'সকল আবেদন পর্যালোচনা করুন'}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveMenu('payments')}
                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>রাজস্ব ও কর হিসাব দেখুন</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}

                {userSession.role === 'supervisor' && !canAnyApproval && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                    <strong>নিরাপত্তা নীতি:</strong> সুপারভাইজার (Supervisor) কেন্দ্রীয় প্রশাসক; ডিফল্টভাবে চেয়ারম্যানের পক্ষে সরাসরি সনদ স্বাক্ষর/অনুমোদন ক্ষমতা নেই।
                  </div>
                )}
              </div>
            </div>

            {/* Cross-Unit Institution Breakdown for Super Admin, UNO & Monitoring */}
            {isSuperOrUpazila && stats?.institution_breakdown && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    প্রতিষ্ঠানভিত্তিক সেবা ও রাজস্ব সারাংশ (১০টি ইউনিয়ন + পাবনা পৌরসভা)
                  </h3>
                </div>
                <ResponsiveDataTable
                  data={stats.institution_breakdown}
                  columns={instBreakdownCols}
                  rowKey={(r) => r.unit_id}
                  mobileCardTitle={(r) => r.name_bn}
                />
              </div>
            )}

            {/* Recent Applications Table (hidden when applications.view is not granted) */}
            {hasPerm('applications.view') && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">সাম্প্রতিক আবেদনসমূহ</h3>
                  <button
                    type="button"
                    onClick={() => setActiveMenu('applications')}
                    className="text-xs text-emerald-700 hover:underline font-bold"
                  >
                    সব আবেদন দেখুন →
                  </button>
                </div>
                <ResponsiveDataTable
                  data={applications.slice(0, 6)}
                  columns={appColumns}
                  rowKey={(a) => a.id}
                  mobileCardTitle={(a) => `${a.service_name_bn} (${a.tracking_no})`}
                  mobileCardActions={(a) => (
                    <button
                      type="button"
                      onClick={() => openApplicationModal(a)}
                      className="bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-[11px]"
                    >
                      {isMonitoringOfficer ? 'পর্যবেক্ষণ দেখুন' : 'পর্যালোচনা ও পদক্ষেপ'}
                    </button>
                  )}
                />
              </div>
            )}
          </div>
        )}

        {/* APPLICATIONS TAB */}
        {activeMenu === 'applications' && (
          <div className="p-4 sm:p-6 space-y-5 min-w-0 max-w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">আবেদন ব্যবস্থাপনা ও অনুমোদন</h2>
                <p className="text-xs text-slate-500">
                  নথি যাচাই, কর্মকর্তা নিয়োগ, সংশোধন অনুরোধ, ফরোয়ার্ড ও চূড়ান্ত QR সনদ অনুমোদন
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {hasPerm('applications.create') && (
                  <button
                    type="button"
                    onClick={() => setShowNewAppModal(true)}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-2xs"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>+ নতুন আবেদন তৈরি ({unit.name_bn})</span>
                  </button>
                )}
                <div className="flex flex-wrap rounded-xl border border-emerald-200 bg-emerald-50/70 p-0.5 text-xs font-bold gap-0.5">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1.5 rounded-lg transition-colors ${
                      statusFilter === 'all' ? 'bg-emerald-700 text-white' : 'text-emerald-900'
                    }`}
                  >
                    সকল ({applications.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('draft')}
                    className={`px-2.5 py-1.5 rounded-lg transition-colors ${
                      statusFilter === 'draft' ? 'bg-emerald-700 text-white' : 'text-emerald-900'
                    }`}
                  >
                    খসড়া ({applications.filter((a) => a.status === 'draft').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('forwarded_for_approval')}
                    className={`px-2.5 py-1.5 rounded-lg transition-colors ${
                      statusFilter === 'forwarded_for_approval' ? 'bg-emerald-700 text-white' : 'text-emerald-900'
                    }`}
                  >
                    পেন্ডিং অনুমোদন ({applications.filter((a) => a.status === 'forwarded_for_approval').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('correction_required')}
                    className={`px-2.5 py-1.5 rounded-lg transition-colors ${
                      statusFilter === 'correction_required' ? 'bg-emerald-700 text-white' : 'text-emerald-900'
                    }`}
                  >
                    সংশোধন ({applications.filter((a) => a.status === 'correction_required').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('certificate_issued')}
                    className={`px-2.5 py-1.5 rounded-lg transition-colors ${
                      statusFilter === 'certificate_issued' ? 'bg-emerald-700 text-white' : 'text-emerald-900'
                    }`}
                  >
                    অনুমোদিত ({applications.filter((a) => a.status === 'certificate_issued').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('rejected')}
                    className={`px-2.5 py-1.5 rounded-lg transition-colors ${
                      statusFilter === 'rejected' ? 'bg-emerald-700 text-white' : 'text-emerald-900'
                    }`}
                  >
                    প্রত্যাখ্যাত ({applications.filter((a) => a.status === 'rejected').length})
                  </button>
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white text-slate-800"
                >
                  <option value="all">সকল অবস্থা ({applications.length})</option>
                  <option value="draft">খসড়া (Draft)</option>
                  <option value="pending_payment">পেমেন্ট অপেক্ষমাণ</option>
                  <option value="paid">ফি পরিশোধিত</option>
                  <option value="under_verification">যাচাই চলছে</option>
                  <option value="correction_required">সংশোধন প্রয়োজন</option>
                  <option value="forwarded_for_approval">চেয়ারম্যান অনুমোদনের অপেক্ষায়</option>
                  <option value="certificate_issued">সনদ ইস্যুকৃত</option>
                  <option value="rejected">বাতিল</option>
                </select>
              </div>
            </div>

            {canAnyApproval && userSession.approval_authorities && userSession.approval_authorities.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="font-bold text-emerald-950">
                  আপনার আইনগত সনদ অনুমোদন এখতিয়ার ({userSession.title_bn}):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {userSession.approval_authorities.map((auth, idx) => (
                    <span
                      key={`${auth.administrative_unit_id}_${auth.service_id}_${idx}`}
                      className="px-2.5 py-0.5 rounded-full bg-white border border-emerald-300 text-emerald-900 font-semibold text-[11px]"
                    >
                      {auth.service_id === '*' ? 'সকল অনুমোদিত সেবা' : auth.service_id} •{' '}
                      {institutions.find((i) => i.id === auth.administrative_unit_id)?.name_bn ||
                        auth.administrative_unit_id}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ট্র্যাকিং নম্বর, আবেদনকারী, সেবা অথবা কর্মকর্তা দিয়ে খুঁজুন..."
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <ResponsiveDataTable
                data={filteredApps}
                columns={appColumns}
                rowKey={(a) => a.id}
                mobileCardTitle={(a) => `${a.applicant_name_bn} — ${a.service_name_bn}`}
                mobileCardBadge={(a) => (
                  <span
                    className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      APP_STATUS_BADGE[a.status]?.cls || 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {APP_STATUS_BADGE[a.status]?.label || a.status}
                  </span>
                )}
                mobileCardActions={(a) => (
                  <button
                    type="button"
                    onClick={() => openApplicationModal(a)}
                    className="bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-[11px]"
                  >
                    পর্যালোচনা ও অনুমোদন
                  </button>
                )}
              />
            </div>
          </div>
        )}

        {/* CERTIFICATES TAB */}
        {activeMenu === 'certificates' && (
          <CertificateManagementPanel
            userSession={userSession}
            institutions={institutions}
            services={services}
            canFinalApprove={canAnyApproval}
            isCrossUnit={isSuperOrUpazila}
            selectedUnitFilter={selectedUnitFilter}
            onPrintCertificate={onPrintCertificate}
            onNavigateVerify={onNavigateVerify}
            onRefreshDashboard={refreshServerData}
          />
        )}

        {/* MONITORING & SLA OBSERVATIONS TAB */}
        {activeMenu === 'monitoring' && (
          <div className="p-4 sm:p-6 space-y-5 min-w-0 max-w-full">
            <div>
              <h2 className="text-xl font-bold text-slate-900">উপজেলা মনিটরিং ও SLA পর্যবেক্ষণ</h2>
              <p className="text-xs text-slate-500">
                ১০টি ইউনিয়ন ও পাবনা পৌরসভার সেবার মান, পেন্ডিং জট ও সময়সীমা পর্যবেক্ষণ (সম্পূর্ণ Read-Only ও পর্যবেক্ষণ নোট)
              </p>
            </div>

            {hasPerm('monitoring.observe') && (
              <form
                onSubmit={handleCreateObservation}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3 text-xs"
              >
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                  নতুন পর্যবেক্ষণ নোট লিপিবদ্ধ করুন
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold block mb-1">প্রতিষ্ঠান *</label>
                    <select
                      value={obsUnitId}
                      onChange={(e) => setObsUnitId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                    >
                      {institutions.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name_bn}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold block mb-1">গুরুত্ব / ধরন</label>
                    <select
                      value={obsSeverity}
                      onChange={(e) => setObsSeverity(e.target.value as typeof obsSeverity)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                    >
                      <option value="info">সাধারণ তথ্য (Info)</option>
                      <option value="warning">সতর্কতা (Warning)</option>
                      <option value="overdue">সময়সীমা অতিক্রান্ত (Overdue)</option>
                      <option value="critical">জরুরি (Critical)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold block mb-1">সংশ্লিষ্ট আবেদন আইডি (ঐচ্ছিক)</label>
                    <input
                      type="text"
                      value={obsAppId}
                      onChange={(e) => setObsAppId(e.target.value)}
                      placeholder="যেমন: UP-2026-10025"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-bold block mb-1">পর্যবেক্ষণ মন্তব্য *</label>
                  <textarea
                    rows={2}
                    required
                    value={obsText}
                    onChange={(e) => setObsText(e.target.value)}
                    placeholder="যেমন: নির্ধারিত ৩ কার্যদিবসের মধ্যে যাচাই প্রতিবেদন দাখিল নিশ্চিত করার পরামর্শ..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <button
                  type="submit"
                  disabled={obsBusy}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl"
                >
                  {obsBusy ? 'সংরক্ষণ হচ্ছে...' : 'পর্যবেক্ষণ দাখিল করুন'}
                </button>
              </form>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                দাখিলকৃত পর্যবেক্ষণসমূহ ({monitoringObservations.length})
              </h3>
              {monitoringObservations.length === 0 ? (
                <p className="text-xs text-slate-400">এখনো কোনো মনিটরিং পর্যবেক্ষণ দাখিল করা হয়নি।</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {monitoringObservations.map((obs) => (
                    <div key={obs.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              obs.severity === 'critical' || obs.severity === 'overdue'
                                ? 'bg-red-100 text-red-800'
                                : obs.severity === 'warning'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {obs.severity}
                          </span>
                          <span className="font-bold text-slate-900">
                            {institutions.find((i) => i.id === obs.administrative_unit_id)?.name_bn ||
                              obs.administrative_unit_id}
                          </span>
                          {obs.application_id && (
                            <span className="font-mono text-[11px] text-emerald-800">
                              ({obs.application_id})
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">
                          {new Date(obs.created_at).toLocaleString('bn-BD')}
                        </span>
                      </div>
                      <p className="text-slate-800">{obs.observation_bn}</p>
                      <div className="text-[11px] text-slate-500">পর্যবেক্ষক: {obs.officer_name_bn}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* COMPLAINTS & ESCALATION TAB (UNO / Super Admin / Institution) */}
        {activeMenu === 'complaints' && (
          <div className="p-4 sm:p-6 space-y-5 min-w-0 max-w-full">
            <div>
              <h2 className="text-xl font-bold text-slate-900">অভিযোগ ও উপজেলা এস্কেলেশন ব্যবস্থাপনা</h2>
              <p className="text-xs text-slate-500">
                নাগরিক ও প্রাতিষ্ঠানিক অভিযোগ পর্যালোচনা, সংশ্লিষ্ট ইউনিয়নে প্রেরণ এবং নিষ্পত্তি প্রতিবেদন (UNO তদারকি)
              </p>
            </div>

            <form
              onSubmit={handleCreateComplaint}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3 text-xs"
            >
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                নতুন অভিযোগ / এস্কেলেশন নিবন্ধন করুন
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold block mb-1">সংশ্লিষ্ট প্রতিষ্ঠান *</label>
                  <select
                    value={isSuperOrUpazila ? cmpUnitId : currentUnitId || cmpUnitId}
                    disabled={!isSuperOrUpazila}
                    onChange={(e) => setCmpUnitId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white disabled:bg-slate-50"
                  >
                    {institutions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name_bn}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1">সংশ্লিষ্ট আবেদন নং (ঐচ্ছিক)</label>
                  <input
                    type="text"
                    value={cmpAppId}
                    onChange={(e) => setCmpAppId(e.target.value)}
                    placeholder="যেমন: UP-2026-10025"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">বিষয় *</label>
                  <input
                    type="text"
                    required
                    value={cmpSubject}
                    onChange={(e) => setCmpSubject(e.target.value)}
                    placeholder="যেমন: নির্ধারিত সময়ে সনদ ইস্যু বিলম্ব"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold block mb-1">বিস্তারিত বিবরণ *</label>
                <textarea
                  rows={2}
                  required
                  value={cmpDetails}
                  onChange={(e) => setCmpDetails(e.target.value)}
                  placeholder="অভিযোগের বিস্তারিত বিবরণ লিখুন..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <button
                type="submit"
                disabled={cmpBusy}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl"
              >
                {cmpBusy ? 'দাখিল হচ্ছে...' : 'অভিযোগ নিবন্ধন করুন'}
              </button>
            </form>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                নিবন্ধিত অভিযোগ ও এস্কেলেশন তালিকা ({complaints.length})
              </h3>
              {complaints.length === 0 ? (
                <p className="text-xs text-slate-400">কোনো অভিযোগ নিবন্ধিত নেই।</p>
              ) : (
                <div className="space-y-3 text-xs">
                  {complaints.map((c) => (
                    <div key={c.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              c.status === 'resolved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : c.status === 'forwarded' || c.status === 'investigating'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {c.status}
                          </span>
                          <span className="font-bold text-slate-900">{c.subject_bn}</span>
                          <span className="text-slate-600">
                            ({institutions.find((i) => i.id === c.administrative_unit_id)?.name_bn || c.administrative_unit_id})
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">
                          {new Date(c.created_at).toLocaleString('bn-BD')}
                        </span>
                      </div>
                      <p className="text-slate-700">{c.details_bn}</p>
                      {c.resolution_note_bn && (
                        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
                          <strong>প্রশাসনিক নির্দেশনা / নিষ্পত্তি নোট:</strong> {c.resolution_note_bn}
                        </div>
                      )}
                      {hasPerm('complaints.manage') && c.status !== 'resolved' && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateComplaintStatus(
                                c,
                                'forwarded',
                                'UNO কার্যালয় হতে সংশ্লিষ্ট ইউনিয়ন/পৌরসভায় ব্যাখ্যা ও জরুরি নিষ্পত্তির জন্য প্রেরিত।'
                              )
                            }
                            className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px]"
                          >
                            প্রতিষ্ঠানে ফরোয়ার্ড (UNO)
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateComplaintStatus(
                                c,
                                'resolved',
                                'সংশ্লিষ্ট প্রতিষ্ঠানের প্রতিবেদনের ভিত্তিতে অভিযোগ নিষ্পত্তি করা হলো।'
                              )
                            }
                            className="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px]"
                          >
                            নিষ্পত্তি সম্পন্ন করুন
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* DEVELOPER / TECHNICAL ADMIN CONSOLE TAB */}
        {activeMenu === 'developer_console' && (
          <div className="p-4 sm:p-6 space-y-6 min-w-0 max-w-full">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  ডেভেলপার / টেকনিক্যাল অ্যাডমিন ও প্রোডাকশন কন্ট্রোল কনসোল
                </h2>
                <p className="text-xs text-slate-500">
                  স্যানিটাইজড সিস্টেম ডায়াগনস্টিকস, রিলিজ লগ এবং সুপার অ্যাডমিন অনুমোদিত সময়সীমাবদ্ধ প্রোডাকশন অ্যাক্সেস
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-slate-900 text-emerald-400 font-mono text-xs font-bold">
                PII & Secrets Redacted • Zero Approval Authority
              </span>
            </div>

            {developerDiagnostics && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="bg-white p-4 rounded-2xl border border-slate-200">
                  <span className="text-slate-500 block">ডাটাবেজ ও টেবিল</span>
                  <span className="text-lg font-black text-emerald-800 font-mono">
                    SQLite ({developerDiagnostics.tables_count} টেবিল)
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    অবস্থা: {developerDiagnostics.sqlite_status}
                  </span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200">
                  <span className="text-slate-500 block">RBAC ক্যাটালগ</span>
                  <span className="text-lg font-black text-slate-900 font-mono">
                    {developerDiagnostics.roles_count} রোল • {developerDiagnostics.permissions_count} পারমিশন
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">৪-রোল সরকারি কাঠামো</span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200">
                  <span className="text-slate-500 block">PDF ও QR ইঞ্জিন</span>
                  <span className="text-sm font-bold text-slate-900 block mt-1">
                    {developerDiagnostics.pdf_engine}
                  </span>
                  <span className="text-[11px] text-emerald-700 font-semibold block mt-0.5">সক্রিয় ও যাচাইকৃত</span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200">
                  <span className="text-slate-500 block">নিরাপত্তা ও গোপনীয়তা</span>
                  <span className="text-sm font-bold text-emerald-800 block mt-1">
                    গোপন কী ও নাগরিক তথ্য সংরক্ষিত
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    প্রোডাকশন উইন্ডো:{' '}
                    {developerDiagnostics.active_production_access
                      ? `সক্রিয় (${new Date(developerDiagnostics.active_production_access.expires_at!).toLocaleTimeString('bn-BD')} পর্যন্ত)`
                      : 'নিষ্ক্রিয় (অনুমোদন প্রয়োজন)'}
                  </span>
                </div>
              </div>
            )}

            {/* ENVIRONMENT & ISOLATION ARCHITECTURE PANEL */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className={`w-3 h-3 rounded-full ${envDiagnostics?.is_testing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      পরিবেশ ও আইসোলেশন আর্কিটেকচার (Environment & Isolation Architecture)
                      <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-bold ${envDiagnostics?.is_testing ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'}`}>
                        {envDiagnostics?.app_env || 'testing'}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      সিস্টেম ডাটাবেজ, স্টোরেজ ডিরেক্টরি, কিউআর কোড ভেরিফিকেশন ও সেশন সিকিউরিটি সম্পূর্ণ আলাদা
                    </p>
                  </div>
                </div>
                <div className="text-right text-[11px] font-mono text-slate-300">
                  NODE_ENV: <span className="text-white font-bold">{envDiagnostics?.node_env || 'production'}</span> | APP_ENV: <span className="text-emerald-300 font-bold">{envDiagnostics?.app_env || 'testing'}</span>
                </div>
              </div>

              <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                {/* Database Isolation */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
                  <span className="font-bold text-slate-700 flex items-center justify-between">
                    ডাটাবেজ আইসোলেশন
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono font-semibold">SQLite WAL</span>
                  </span>
                  <div className="font-mono text-[11px] bg-white p-2 rounded border border-slate-200 text-slate-800 break-all">
                    {envDiagnostics?.database.database_file || 'pottoyonbd_testing.sqlite'}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    পাথ: <code className="text-slate-700">{envDiagnostics?.database.resolved_path || 'data/pottoyonbd_testing.sqlite'}</code>
                  </div>
                  <div className="text-[10px] font-semibold text-emerald-700">
                    ✓ প্রোডাকশন ও টেস্ট ডাটাবেজ পৃথকীকৃত
                  </div>
                </div>

                {/* Storage Isolation */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
                  <span className="font-bold text-slate-700 flex items-center justify-between">
                    স্টোরেজ আইসোলেশন
                    <span className="text-[10px] bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-mono font-semibold">Documents & PDFs</span>
                  </span>
                  <div className="font-mono text-[11px] bg-white p-2 rounded border border-slate-200 text-slate-800 break-all">
                    {envDiagnostics?.storage.resolved_dir || 'storage_testing'}
                  </div>
                  <div className="text-[10px] text-slate-500 space-y-0.5">
                    <div>সংযুক্তি: <code className="text-slate-700">{envDiagnostics?.storage.attachments_dir || 'storage_testing/attachments'}</code></div>
                    <div>সনদ PDF: <code className="text-slate-700">{envDiagnostics?.storage.certificates_dir || 'storage_testing/certificates'}</code></div>
                  </div>
                  <div className="text-[10px] font-semibold text-emerald-700">
                    ✓ ফাইল ও সনদপত্র পৃথক ফোল্ডারে সংরক্ষিত
                  </div>
                </div>

                {/* QR & Verification Isolation */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
                  <span className="font-bold text-slate-700 flex items-center justify-between">
                    QR ও ভেরিফিকেশন লিঙ্ক
                    <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-mono font-semibold">SHA-256</span>
                  </span>
                  <div className="font-mono text-[11px] bg-white p-2 rounded border border-slate-200 text-purple-900 break-all font-semibold">
                    {envDiagnostics?.urls.qr_verify_base_url || 'https://prottoyonbd.maltimarket.com/verify'}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    টেস্টিং ডোমেইন: <code className="text-slate-700">{envDiagnostics?.urls.app_url || 'https://prottoyonbd.maltimarket.com'}</code>
                  </div>
                  <div className="text-[10px] font-semibold text-emerald-700">
                    ✓ টেস্ট কিউআর কোড প্রোডাকশনে সমাধান হবে না
                  </div>
                </div>

                {/* Session & Watermark Protection */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
                  <span className="font-bold text-slate-700 flex items-center justify-between">
                    সেশন ও ওয়াটারমার্ক সুরক্ষা
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono font-semibold">HMAC-SHA256</span>
                  </span>
                  <div className="text-[11px] bg-white p-2 rounded border border-slate-200 text-slate-700 space-y-1">
                    <div>সেশন ফিঙ্গারপ্রিন্ট: <code className="font-mono text-slate-900 font-bold">{envDiagnostics?.security.session_secret_fingerprint || 'configured'}</code></div>
                    <div>ওয়াটারমার্ক: <span className="font-bold text-amber-700">{envDiagnostics?.watermark.active ? 'সক্রিয় (TESTING)' : 'নিষ্ক্রিয় (Production)'}</span></div>
                  </div>
                  <div className="text-[10px] font-semibold text-emerald-700">
                    ✓ গোপনীয় কী ও সিগরেট স্যানিটাইজড (রেডাক্টেড)
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
              {/* Time-limited Production Access Request Form */}
              <form
                onSubmit={handleCreateDevAccessRequest}
                className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                  সময়সীমাবদ্ধ প্রোডাকশন অ্যাক্সেস অনুরোধ (Super Admin অনুমোদন আবশ্যক)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold block mb-1">অ্যাক্সেস পরিধি (Scope)</label>
                    <select
                      value={devReqScope}
                      onChange={(e) => setDevReqScope(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                    >
                      <option value="production_deployment">Production Deployment</option>
                      <option value="schema_migration">Database Schema Migration</option>
                      <option value="pdf_template_hotfix">PDF / QR Engine Hotfix</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold block mb-1">সময়সীমা (মিনিট — সর্বোচ্চ ২৪০)</label>
                    <input
                      type="number"
                      min={5}
                      max={240}
                      value={devReqMinutes}
                      onChange={(e) => setDevReqMinutes(Number(e.target.value) || 30)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-bold block mb-1">কারিগরি কারণ ও চেঞ্জ টিকেট বিবরণ *</label>
                  <textarea
                    rows={2}
                    required
                    value={devReqReason}
                    onChange={(e) => setDevReqReason(e.target.value)}
                    placeholder="যেমন: প্রোডাকশন সার্ভারে জরুরি সিকিউরিটি প্যাচ ডিপ্লয়মেন্টের জন্য ৩০ মিনিটের অ্যাক্সেস..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <button
                  type="submit"
                  disabled={devBusy}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl"
                >
                  প্রোডাকশন অ্যাক্সেস অনুরোধ পাঠান
                </button>
              </form>

              {/* Release & Deployment Audit Form */}
              <form
                onSubmit={handleRecordDeployment}
                className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                  রিলিজ ও ডিপ্লয়মেন্ট লগ এন্ট্রি (Staging / Production)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold block mb-1">এনভায়রনমেন্ট</label>
                    <select
                      value={devDeployEnv}
                      onChange={(e) => setDevDeployEnv(e.target.value as 'staging' | 'production')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                    >
                      <option value="staging">Staging (পরীক্ষামূলক)</option>
                      <option value="production">Production (সুপার অ্যাডমিন অনুমোদন সাপেক্ষ)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold block mb-1">ভার্সন ট্যাগ</label>
                    <input
                      type="text"
                      value={devDeployTag}
                      onChange={(e) => setDevDeployTag(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-bold block mb-1">পরিবর্তনের সারসংক্ষেপ *</label>
                  <textarea
                    rows={2}
                    required
                    value={devDeploySummary}
                    onChange={(e) => setDevDeploySummary(e.target.value)}
                    placeholder="যেমন: বাংলা ফন্ট রেন্ডারিং ও RBAC পলিসি আপডেট..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <button
                  type="submit"
                  disabled={devBusy}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl"
                >
                  ডিপ্লয়মেন্ট রেকর্ড করুন
                </button>
              </form>
            </div>

            {/* Production Access Requests Table & Super Admin Approval Controls */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 text-xs">
              <h3 className="text-sm font-bold text-slate-900">
                প্রোডাকশন অ্যাক্সেস অনুরোধ ও অনুমোদন ইতিহাস ({developerAccessRequests.length})
              </h3>
              {developerAccessRequests.length === 0 ? (
                <p className="text-slate-400">কোনো প্রোডাকশন অ্যাক্সেস অনুরোধ নেই।</p>
              ) : (
                <div className="space-y-2">
                  {developerAccessRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              req.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : req.status === 'pending'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {req.status}
                          </span>
                          <span className="font-bold text-slate-900">{req.developer_name_bn}</span>
                          <span className="font-mono text-slate-600">({req.scope} • {req.duration_minutes} মিনিট)</span>
                        </div>
                        <p className="text-slate-700">{req.reason_bn}</p>
                        {req.expires_at && (
                          <div className="text-[11px] text-slate-500 font-mono">
                            অনুমোদনকারী: {req.approved_by_name_bn} • মেয়াদ:{' '}
                            {new Date(req.expires_at).toLocaleString('bn-BD')}
                          </div>
                        )}
                      </div>

                      {userSession.role === 'supervisor' && (
                        <div className="flex items-center gap-2 shrink-0">
                          {req.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleDecideDevAccessRequest(req.id, 'approved')}
                                className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold"
                              >
                                অনুমোদন করুন
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDecideDevAccessRequest(req.id, 'rejected')}
                                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold"
                              >
                                প্রত্যাখ্যান
                              </button>
                            </>
                          )}
                          {req.status === 'approved' && (
                            <button
                              type="button"
                              onClick={() => handleDecideDevAccessRequest(req.id, 'revoked')}
                              className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white font-bold"
                            >
                              অ্যাক্সেস প্রত্যাহার (Revoke)
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <EnterpriseDeveloperAiDebugPanel
              userSession={userSession}
              hasPerm={hasPerm}
              notify={(msg, isErr) => (isErr ? setActionError(msg) : setActionSuccessMessage(msg))}
            />
          </div>
        )}

        {/* WEBSITE CMS & VISUAL PAGE BUILDER TAB */}
        {activeMenu === 'cms_builder' && (
          <EnterpriseCmsAndPagesPanel
            userSession={userSession}
            hasPerm={hasPerm}
            notify={(msg, isErr) => (isErr ? setActionError(msg) : setActionSuccessMessage(msg))}
          />
        )}

        {/* AI SEO & AI CONTENT STUDIO TAB */}
        {activeMenu === 'ai_seo_studio' && (
          <EnterpriseSeoAndAiStudioPanel
            userSession={userSession}
            hasPerm={hasPerm}
            notify={(msg, isErr) => (isErr ? setActionError(msg) : setActionSuccessMessage(msg))}
          />
        )}

        {/* INTEGRATIONS & CERTIFICATE DESIGN TAB */}
        {activeMenu === 'integrations_center' && (
          <EnterpriseIntegrationsAndCertDesignPanel
            userSession={userSession}
            hasPerm={hasPerm}
            notify={(msg, isErr) => (isErr ? setActionError(msg) : setActionSuccessMessage(msg))}
          />
        )}

        {/* SECURITY OPERATIONS (SOC) & VERIFIED BACKUPS TAB */}
        {activeMenu === 'security_backups' && (
          <EnterpriseSecurityAndBackupsPanel
            userSession={userSession}
            hasPerm={hasPerm}
            notify={(msg, isErr) => (isErr ? setActionError(msg) : setActionSuccessMessage(msg))}
          />
        )}

        {/* PAYMENTS TAB */}
        {activeMenu === 'payments' && (
          <PaymentsPanel
            userSession={userSession}
            institutions={institutions}
            isCrossUnit={isSuperOrUpazila}
            canFinalApprove={canAnyApproval}
            currentUnit={unit}
            applications={applications}
            totalRevenue={totalRevenue}
            refundRequests={refundRequests}
            onSuccess={setActionSuccessMessage}
            onError={setActionError}
            onRefreshAll={refreshServerData}
          />
        )}

        {/* HOLDING TAX TAB */}
        {activeMenu === 'holding_tax' && (
          <HoldingTaxPanel
            userSession={userSession}
            institutions={institutions}
            isCrossUnit={isSuperOrUpazila}
            canFinalApprove={canAnyApproval}
            currentUnit={unit}
            holdingTaxes={holdingTaxes}
            onSuccess={setActionSuccessMessage}
            onError={setActionError}
            onRefreshAll={refreshServerData}
          />
        )}

        {/* TRADE LICENSE TAB */}
        {activeMenu === 'trade_license' && (
          <TradeLicensePanel
            userSession={userSession}
            institutions={institutions}
            isCrossUnit={isSuperOrUpazila}
            canFinalApprove={canAnyApproval}
            currentUnit={unit}
            tradeLicenses={tradeLicenses}
            onSuccess={setActionSuccessMessage}
            onError={setActionError}
            onRefreshAll={refreshServerData}
          />
        )}

        {/* STAFF DIRECTORY TAB */}
        {activeMenu === 'staff' && (
          <StaffPanel
            userSession={userSession}
            institutions={institutions}
            isCrossUnit={isSuperOrUpazila}
            canFinalApprove={canAnyApproval}
            currentUnit={unit}
            staff={staffMembers}
            onSuccess={setActionSuccessMessage}
            onError={setActionError}
            onRefreshAll={refreshServerData}
          />
        )}

        {/* WARDS / DEPARTMENTS & NOTICES TABS */}
        {(activeMenu === 'wards_depts' || activeMenu === 'notices') && (
          <WardsAndNoticesPanel
            mode={activeMenu}
            userSession={userSession}
            institutions={institutions}
            isCrossUnit={isSuperOrUpazila}
            canFinalApprove={canAnyApproval}
            currentUnit={unit}
            wardsDepts={wardsDepts}
            notices={notices}
            onSuccess={setActionSuccessMessage}
            onError={setActionError}
            onRefreshAll={refreshServerData}
          />
        )}

        {/* ROLE & RBAC PERMISSION MANAGEMENT TAB */}
        {activeMenu === 'role_management' && (
          <RoleManagementPanel
            userSession={userSession}
            institutions={institutions}
            services={services}
            onSuccess={setActionSuccessMessage}
            onError={setActionError}
          />
        )}

        {/* SERVICES CONFIG, REPORTS, AND SETTINGS TABS */}
        {(activeMenu === 'services_config' || activeMenu === 'reports' || activeMenu === 'settings') && (
          <ReportsAndSettingsPanel
            mode={activeMenu}
            userSession={userSession}
            institutions={institutions}
            isCrossUnit={isSuperOrUpazila}
            canFinalApprove={canAnyApproval}
            currentUnit={unit}
            templates={templates}
            events={events}
            verificationLogs={verificationLogs}
            inquiries={inquiries}
            rolePermissions={rolePermissions}
            systemSettings={systemSettings}
            services={services}
            onSuccess={setActionSuccessMessage}
            onError={setActionError}
            onRefreshAll={refreshServerData}
          />
        )}

        {/* CONTACT MESSAGES TAB (Visible to Chairman, Supervisor, Developer) */}
        {activeMenu === 'contact_messages' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-emerald-700" />
                  <span>যোগাযোগ ও সহায়তা বার্তা ({inquiries.length})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  যোগাযোগ (Jogajog) সেকশন থেকে সাধারণ নাগরিক ও সেবাগ্রহীতাদের প্রেরিত বার্তা ও জিজ্ঞাসা
                </p>
              </div>
            </div>

            {inquiries.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <MessageSquare className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-600">কোনো নতুন যোগাযোগ বার্তা জমা পড়েনি।</p>
                <p className="text-xs text-slate-400">নাগরিকগণ যোগাযোগ পেজ থেকে বার্তা পাঠালে এখানে তা তৎক্ষণাৎ প্রদর্শিত হবে।</p>
              </div>
            ) : (
              <div className="space-y-3">
                {inquiries.map((inq) => (
                  <div key={inq.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition-colors space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{inq.name}</span>
                        <span className="font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
                          {inq.phone}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {new Date(inq.created_at).toLocaleString('bn-BD', {
                          year: 'numeric',
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-700">বিষয়:</span>{' '}
                      <span className="text-emerald-900 font-semibold">{inq.subject}</span>
                    </div>
                    <p className="text-slate-700 bg-white p-3 rounded-lg border border-slate-200 leading-relaxed whitespace-pre-wrap">
                      {inq.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* APPLICATION REVIEW & WORKFLOW MODAL */}
        {selectedApp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 space-y-5 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto text-xs">
              <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                <div>
                  <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {selectedApp.tracking_no}
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-1">
                    {selectedApp.service_name_bn} — আবেদন পর্যালোচনা
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedApp(null)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-full font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Applicant Info Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block">আবেদনকারী:</span>
                  <span className="font-bold text-slate-900">{selectedApp.applicant_name_bn}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">পিতা / মাতা:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedApp.father_name_bn} / {selectedApp.mother_name_bn}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">এনআইডি / জন্ম নিবন্ধন:</span>
                  <span className="font-mono font-semibold text-slate-800">{selectedApp.nid_or_birth_reg}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">ওয়ার্ড ও ঠিকানা:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedApp.ward_no} নং ওয়ার্ড, {selectedApp.village_or_area_bn}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">মোবাইল নম্বর:</span>
                  <span className="font-mono text-slate-800">{selectedApp.mobile}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">পরিশোধিত ফি:</span>
                  <span className="font-mono font-bold text-emerald-800">
                    ৳{selectedApp.fee_amount} ({selectedApp.payment_method?.toUpperCase() || '—'} {selectedApp.transaction_id || ''})
                  </span>
                </div>
              </div>

              {/* Assign Officer Row (only if applications.assign permitted) */}
              {hasPerm('applications.assign') && (
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center gap-2.5">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 shrink-0">
                    <UserPlus className="w-4 h-4 text-emerald-700" />
                    <span>কর্মকর্তা নিয়োগ:</span>
                  </div>
                  <select
                    value={assignStaffId}
                    onChange={(e) => setAssignStaffId(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                  >
                    <option value="">কর্মকর্তা নির্বাচন করুন...</option>
                    {unitStaffOptions.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name_bn} ({st.designation_bn})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!assignStaffId || submitting}
                    onClick={handleAssignOfficer}
                    className="bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white font-bold px-3.5 py-1.5 rounded-lg shrink-0"
                  >
                    দায়িত্ব অর্পণ
                  </button>
                </div>
              )}

              {/* Uploaded Attachments */}
              {selectedApp.attachments && selectedApp.attachments.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-emerald-700" />
                    <span>সংযুক্ত কাগজপত্র ({selectedApp.attachments.length})</span>
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedApp.attachments.map((att) => (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() => {
                          triggerAuthenticatedDownload(
                            `/api/attachments/${encodeURIComponent(att.id)}`,
                            att.original_name,
                            userSession.token
                          ).catch((err) => {
                            setActionError(err instanceof Error ? err.message : 'সংযুক্তি ডাউনলোড ব্যর্থ হয়েছে।');
                          });
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold hover:bg-emerald-100 flex items-center gap-1.5"
                      >
                        <Paperclip className="w-3 h-3" />
                        <span>{att.original_name}</span>
                        <span className="text-[10px] text-slate-500">
                          ({(att.size_bytes / 1024).toFixed(1)} KB)
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Warish Heirs Table */}
              {selectedApp.heirs && selectedApp.heirs.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-800">দাখিলকৃত ওয়ারিশগণের তালিকা:</h4>
                  <div className="border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-100 text-slate-700 font-bold">
                        <tr>
                          <th className="py-1.5 px-3">নং</th>
                          <th className="py-1.5 px-3">নাম</th>
                          <th className="py-1.5 px-3">বয়স</th>
                          <th className="py-1.5 px-3">সম্পর্ক</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedApp.heirs.map((h, i) => (
                          <tr key={i}>
                            <td className="py-1.5 px-3 font-mono">{i + 1}</td>
                            <td className="py-1.5 px-3 font-semibold text-slate-900">{h.name}</td>
                            <td className="py-1.5 px-3 font-mono">{h.age} বছর</td>
                            <td className="py-1.5 px-3 text-slate-700">{h.relation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Approval / Workflow History */}
              {selectedAppHistory.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-blue-700" />
                    <span>পূর্ববর্তী অনুমোদন ও যাচাই ইতিহাস</span>
                  </h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {selectedAppHistory.map((ap) => (
                      <div key={ap.id} className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex justify-between gap-2">
                        <span>
                          <strong className="text-emerald-900">{ap.decision}</strong> — {ap.officer_name_bn}: {ap.notes}
                        </span>
                        <span className="font-mono text-[10px] text-slate-500 shrink-0">
                          {new Date(ap.approved_at).toLocaleDateString('bn-BD')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Review notes & validity input */}
              {(hasPerm('applications.verify') ||
                hasPerm('applications.forward') ||
                hasPerm('applications.recommend') ||
                hasPerm('applications.request_correction') ||
                hasPerm('applications.reject') ||
                hasApprovalAuthorityFor(selectedApp.administrative_unit_id, selectedApp.service_id)) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="font-bold text-slate-700 block mb-1">
                      দাপ্তরিক যাচাই মন্তব্য (Review Notes):
                    </label>
                    <textarea
                      rows={2}
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      placeholder="ওয়ার্ড সদস্যের প্রতিবেদন অনুযায়ী তথ্য সঠিক..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-1 focus:ring-emerald-600 focus:outline-hidden"
                    />
                  </div>
                  {hasApprovalAuthorityFor(selectedApp.administrative_unit_id, selectedApp.service_id) && (
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">মেয়াদ (দিন — ঐচ্ছিক):</label>
                      <input
                        type="number"
                        min={1}
                        value={expiresInDays}
                        onChange={(e) => setExpiresInDays(e.target.value)}
                        placeholder="স্থায়ী (খালি রাখুন)"
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono focus:ring-1 focus:ring-emerald-600 focus:outline-hidden"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Secretary Draft Preparation, Edit & Preview Box */}
              {hasPerm('applications.edit') && selectedApp.status !== 'certificate_issued' && (
                <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-teal-950 block">
                        ইউপি সচিব আবেদন প্রস্তুতি ও খসড়া প্রক্রিয়াকরণ (UP Secretary Workflow)
                      </span>
                      <span className="text-[11px] text-teal-800">
                        নাগরিকের তথ্য ও ঠিকানা সম্পাদনা, খসড়া সংরক্ষণ, খসড়া প্রিভিউ এবং চেয়ারম্যানের নিকট দাখিল
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={handleOpenDraftPreview}
                        className="px-3 py-1.5 rounded-lg bg-white border border-teal-300 text-teal-900 font-bold hover:bg-teal-100"
                      >
                        খসড়া প্রিভিউ (Draft Preview)
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingDraftMode((v) => !v)}
                        className="px-3 py-1.5 rounded-lg bg-teal-800 text-white font-bold hover:bg-teal-900"
                      >
                        {editingDraftMode ? 'সম্পাদনা বন্ধ করুন' : 'তথ্য সম্পাদনা করুন'}
                      </button>
                    </div>
                  </div>

                  {editingDraftMode && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white p-3.5 rounded-xl border border-teal-200">
                      <div>
                        <label className="font-bold block mb-0.5 text-slate-700">আবেদনকারীর নাম (বাংলা) *</label>
                        <input
                          type="text"
                          value={draftApplicantName}
                          onChange={(e) => setDraftApplicantName(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="font-bold block mb-0.5 text-slate-700">পিতা/স্বামীর নাম (বাংলা) *</label>
                        <input
                          type="text"
                          value={draftFatherName}
                          onChange={(e) => setDraftFatherName(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="font-bold block mb-0.5 text-slate-700">মাতার নাম (বাংলা) *</label>
                        <input
                          type="text"
                          value={draftMotherName}
                          onChange={(e) => setDraftMotherName(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="font-bold block mb-0.5 text-slate-700">এনআইডি / জন্ম নিবন্ধন *</label>
                        <input
                          type="text"
                          value={draftNid}
                          onChange={(e) => setDraftNid(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                        />
                      </div>
                      <div>
                        <label className="font-bold block mb-0.5 text-slate-700">মোবাইল নম্বর *</label>
                        <input
                          type="text"
                          value={draftMobile}
                          onChange={(e) => setDraftMobile(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                        />
                      </div>
                      <div>
                        <label className="font-bold block mb-0.5 text-slate-700">ওয়ার্ড নম্বর *</label>
                        <input
                          type="number"
                          min={1}
                          max={15}
                          value={draftWardNo}
                          onChange={(e) => setDraftWardNo(Number(e.target.value) || 1)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                        />
                      </div>
                      <div>
                        <label className="font-bold block mb-0.5 text-slate-700">গ্রাম / মহল্লা *</label>
                        <input
                          type="text"
                          value={draftVillage}
                          onChange={(e) => setDraftVillage(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="font-bold block mb-0.5 text-slate-700">বর্তমান ঠিকানা *</label>
                        <input
                          type="text"
                          value={draftPresentAddr}
                          onChange={(e) => setDraftPresentAddr(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="font-bold block mb-0.5 text-slate-700">স্থায়ী ঠিকানা *</label>
                        <input
                          type="text"
                          value={draftPermanentAddr}
                          onChange={(e) => setDraftPermanentAddr(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleSaveSecretaryDraftOrSubmit(false)}
                          className="px-3.5 py-1.5 rounded-lg border border-teal-700 text-teal-900 font-bold bg-teal-50 hover:bg-teal-100"
                        >
                          খসড়া সংরক্ষণ (Save Draft)
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleSaveSecretaryDraftOrSubmit(true)}
                          className="px-4 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold"
                        >
                          সম্পূর্ণতা যাচাই ও চেয়ারম্যানের নিকট দাখিল
                        </button>
                      </div>
                    </div>
                  )}

                  {draftPreviewData && (
                    <div className="p-4 rounded-xl bg-white border-2 border-dashed border-amber-500 space-y-2">
                      <div className="p-2 rounded-lg bg-amber-100 text-amber-950 font-bold text-center">
                        ⚠️ {draftPreviewData.draft_label_bn}
                      </div>
                      <div className="text-center space-y-0.5 border-b border-slate-200 pb-2">
                        <div className="font-bold text-sm text-slate-900">{draftPreviewData.institution.name_bn}</div>
                        <div className="text-[11px] text-slate-600">
                          {draftPreviewData.institution.upazila_bn}, {draftPreviewData.institution.district_bn}, বাংলাদেশ
                        </div>
                        <div className="font-bold text-emerald-900 pt-1">
                          {draftPreviewData.application.service_name_bn} (খসড়া প্রিভিউ)
                        </div>
                      </div>
                      <p className="text-slate-800 leading-relaxed text-justify">
                        এই মর্মে প্রত্যয়ন করা যাইতেছে যে, <strong>{draftPreviewData.application.applicant_name_bn}</strong>, পিতা/স্বামীঃ{' '}
                        <strong>{draftPreviewData.application.father_name_bn}</strong>, মাতাঃ{' '}
                        <strong>{draftPreviewData.application.mother_name_bn}</strong>, গ্রাম/মহল্লাঃ{' '}
                        {draftPreviewData.application.village_or_area_bn}, ওয়ার্ড নংঃ {draftPreviewData.application.ward_no}।
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                        <span>চূড়ান্ত পিডিএফ ডাউনলোড/প্রিন্ট: চেয়ারম্যান অনুমোদনের পূর্বে নিষ্ক্রিয়</span>
                        <span>অনুমোদনকারী: {draftPreviewData.institution.approving_officer_name_bn}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Correction Request Box */}
              {showCorrectionInput && hasPerm('applications.request_correction') && (
                <div className="p-3.5 rounded-xl bg-orange-50 border border-orange-200 space-y-2">
                  <label className="font-bold text-orange-900 block">
                    সংশোধনের কারণ উল্লেখ করুন (নাগরিকের কাছে প্রেরণ করা হবে):
                  </label>
                  <textarea
                    rows={2}
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    placeholder="যেমন: জাতীয় পরিচয়পত্রের স্পষ্ট কপি এবং পিতার নামের বানান সংশোধন করুন..."
                    className="w-full px-3 py-2 border border-orange-300 rounded-xl bg-white"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCorrectionInput(false)}
                      className="px-3 py-1 rounded-lg border border-slate-300 bg-white font-bold"
                    >
                      বাতিল
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleRequestCorrection}
                      className="px-3 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold"
                    >
                      নিশ্চিত সংশোধন ফেরত পাঠান
                    </button>
                  </div>
                </div>
              )}

              {!hasApprovalAuthorityFor(selectedApp.administrative_unit_id, selectedApp.service_id) && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                  আপনার বর্তমান পদবি ও অনুমোদন সীমা (<strong>{userSession.title_bn}</strong>) অনুযায়ী এই আবেদনের চূড়ান্ত অনুমোদন ও সনদ স্বাক্ষরের ক্ষমতা নির্ধারিত নেই। কেবল নির্ধারিত ইউপি চেয়ারম্যান / অনুমোদিত কর্মকর্তা চূড়ান্ত অনুমোদন করতে পারবেন।
                </div>
              )}

              {/* Action Buttons (Strictly RBAC Gated) */}
              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {hasPerm('applications.reject') &&
                    hasApprovalAuthorityFor(selectedApp.administrative_unit_id, selectedApp.service_id) && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleUpdateStatus('rejected')}
                        className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold px-3.5 py-2 rounded-xl transition-colors disabled:opacity-50"
                      >
                        আবেদন বাতিল
                      </button>
                    )}
                  {hasApprovalAuthorityFor(selectedApp.administrative_unit_id, selectedApp.service_id) &&
                    selectedApp.status !== 'certificate_issued' && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={handleReturnToSecretary}
                        className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold px-3.5 py-2 rounded-xl transition-colors disabled:opacity-50"
                      >
                        সচিবের নিকট ফেরত পাঠান
                      </button>
                    )}
                  {hasPerm('applications.request_correction') && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => setShowCorrectionInput((v) => !v)}
                      className="bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 font-bold px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>সংশোধন ফেরত</span>
                    </button>
                  )}
                  {hasPerm('monitoring.observe') && (
                    <button
                      type="button"
                      onClick={() => {
                        setObsUnitId(selectedApp.administrative_unit_id);
                        setObsAppId(selectedApp.tracking_no);
                        setSelectedApp(null);
                        setActiveMenu('monitoring');
                      }}
                      className="bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>মনিটরিং নোট যোগ</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Correction Response & Resubmit Box for UP_SECRETARY (and UP_CHAIRMAN) when status === 'correction_required' */}
                  {selectedApp.status === 'correction_required' && hasPerm('applications.submit') && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleResubmitCorrection}
                      className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                    >
                      সংশোধনী জবাব ও পুনঃদাখিল
                    </button>
                  )}

                  {hasPerm('applications.verify') && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleUpdateStatus('under_verification')}
                      className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold px-3.5 py-2 rounded-xl transition-colors disabled:opacity-50"
                    >
                      সরেজমিন যাচাই
                    </button>
                  )}

                  {(hasPerm('applications.forward') || hasPerm('applications.recommend')) &&
                    !hasApprovalAuthorityFor(selectedApp.administrative_unit_id, selectedApp.service_id) && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleUpdateStatus('forwarded_for_approval')}
                        className="bg-teal-700 hover:bg-teal-800 text-white font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                      >
                        চেয়ারম্যানের নিকট প্রেরণ
                      </button>
                    )}

                  {hasApprovalAuthorityFor(selectedApp.administrative_unit_id, selectedApp.service_id) &&
                    selectedApp.status === 'draft' && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleSaveSecretaryDraftOrSubmit(true)}
                        className="bg-teal-700 hover:bg-teal-800 text-white font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                      >
                        খসড়া দাখিল করুন (Submit Draft)
                      </button>
                    )}

                  {hasApprovalAuthorityFor(selectedApp.administrative_unit_id, selectedApp.service_id) && (
                    <button
                      type="button"
                      disabled={
                        submitting || selectedApp.payment_status !== 'paid' || selectedApp.status === 'draft'
                      }
                      onClick={() => handleUpdateStatus('certificate_issued')}
                      className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl transition-colors shadow-md flex items-center gap-1.5"
                    >
                      <Award className="w-4 h-4" />
                      <span>
                        {submitting
                          ? 'QR ও PDF তৈরি হচ্ছে...'
                          : selectedApp.status === 'draft'
                          ? 'খসড়া অবস্থা (আগে দাখিল করুন)'
                          : selectedApp.payment_status !== 'paid'
                          ? 'ফি বকেয়া (ইস্যু অযোগ্য)'
                          : 'চূড়ান্ত অনুমোদন ও সনদ ইস্যু'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* IN-DASHBOARD OFFICER NEW APPLICATION MODAL (UP_SECRETARY & UP_CHAIRMAN) */}
        {showNewAppModal && hasPerm('applications.create') && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto text-xs">
              <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                <div>
                  <span className="font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 text-[11px]">
                    নির্ধারিত ইউনিয়ন: {unit.name_bn}
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-1">
                    নতুন সনদ ও নাগরিক সেবা আবেদন তৈরি ({userSession.title_bn})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewAppModal(false)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-full font-bold"
                >
                  ✕
                </button>
              </div>

              {userSession.role === 'chairman' && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-[11px]">
                  <strong>অনুমোদন নীতিমালা:</strong> চেয়ারম্যান কর্তৃক তৈরিকৃত আবেদন স্বয়ংক্রিয়ভাবে অনুমোদিত হয় না। আবেদনটি দাখিলের পর অনুমোদন কিউ থেকে পর্যালোচনা করে সুনির্দিষ্টভাবে চূড়ান্ত অনুমোদন প্রদান করতে হবে।
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1 text-slate-700">নির্ধারিত প্রতিষ্ঠান (লককৃত) *</label>
                  <input
                    type="text"
                    disabled
                    value={`${unit.name_bn} (${unit.upazila_bn}, ${unit.district_bn})`}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-100 text-slate-700 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">সনদ বা সেবার ধরন নির্বাচন করুন *</label>
                  <select
                    value={newAppServiceId}
                    onChange={(e) => setNewAppServiceId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold"
                  >
                    {services
                      .filter((s) => s.is_active !== false)
                      .map((srv) => (
                        <option key={srv.id} value={srv.id}>
                          {srv.name_bn} (ফি: ৳{srv.default_fee})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">আবেদনকারীর নাম (বাংলা) *</label>
                  <input
                    type="text"
                    required
                    value={newAppApplicantName}
                    onChange={(e) => setNewAppApplicantName(e.target.value)}
                    placeholder="যেমন: মোঃ মনিরুল ইসলাম ছবুর"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">আবেদনকারীর নাম (ইংরেজি - ঐচ্ছিক)</label>
                  <input
                    type="text"
                    value={newAppApplicantNameEn}
                    onChange={(e) => setNewAppApplicantNameEn(e.target.value)}
                    placeholder="e.g. Md. Monirul Islam"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">পিতা / স্বামীর নাম (বাংলা) *</label>
                  <input
                    type="text"
                    value={newAppFatherName}
                    onChange={(e) => setNewAppFatherName(e.target.value)}
                    placeholder="যেমন: মোঃ আব্দুল মমিন মোল্লা"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">মাতার নাম (বাংলা) *</label>
                  <input
                    type="text"
                    value={newAppMotherName}
                    onChange={(e) => setNewAppMotherName(e.target.value)}
                    placeholder="যেমন: মোছাঃ মাবিয়া খাতুন"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">জাতীয় পরিচয়পত্র / জন্ম নিবন্ধন নম্বর *</label>
                  <input
                    type="text"
                    value={newAppNid}
                    onChange={(e) => setNewAppNid(e.target.value)}
                    placeholder="১৭ সংখ্যার এনআইডি বা জন্ম নিবন্ধন"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">মোবাইল নম্বর *</label>
                  <input
                    type="text"
                    required
                    value={newAppMobile}
                    onChange={(e) => setNewAppMobile(e.target.value)}
                    placeholder="017XXXXXXXX"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">ওয়ার্ড নম্বর *</label>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={newAppWardNo}
                    onChange={(e) => setNewAppWardNo(Number(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">গ্রাম / মহল্লা *</label>
                  <input
                    type="text"
                    value={newAppVillage}
                    onChange={(e) => setNewAppVillage(e.target.value)}
                    placeholder="যেমন: গয়েশপুর পূর্বপাড়া"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">ডাকঘর (Post Office)</label>
                  <input
                    type="text"
                    value={newAppPostOffice}
                    onChange={(e) => setNewAppPostOffice(e.target.value)}
                    placeholder="যেমন: গয়েশপুর - ৬৬০০"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">বর্তমান ঠিকানা</label>
                  <input
                    type="text"
                    value={newAppPresentAddr}
                    onChange={(e) => setNewAppPresentAddr(e.target.value)}
                    placeholder="গ্রাম, ডাকঘর, ওয়ার্ড, ইউনিয়ন, পাবনা সদর"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="font-bold block mb-1 text-slate-700">স্থায়ী ঠিকানা</label>
                  <input
                    type="text"
                    value={newAppPermanentAddr}
                    onChange={(e) => setNewAppPermanentAddr(e.target.value)}
                    placeholder="গ্রাম, ডাকঘর, ওয়ার্ড, ইউনিয়ন, পাবনা সদর"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              {(newAppServiceId === 'srv_warish' || newAppServiceId === 'srv_family') && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">ওয়ারিশ / পরিবারের সদস্যদের তালিকা:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setNewAppHeirs((prev) => [
                          ...prev,
                          { sl: prev.length + 1, name: '', dob: '০১-০১-১৯৯০', age: 25, relation: 'সদস্য' },
                        ])
                      }
                      className="text-emerald-700 font-bold hover:underline"
                    >
                      + সদস্য যোগ করুন
                    </button>
                  </div>
                  {newAppHeirs.map((h, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2">
                      <input
                        type="text"
                        value={h.name}
                        onChange={(e) =>
                          setNewAppHeirs((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, name: e.target.value } : item))
                          )
                        }
                        placeholder="নাম"
                        className="col-span-5 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                      <input
                        type="text"
                        value={h.dob}
                        onChange={(e) =>
                          setNewAppHeirs((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, dob: e.target.value } : item))
                          )
                        }
                        placeholder="জন্ম তারিখ"
                        className="col-span-3 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                      <input
                        type="number"
                        value={h.age}
                        onChange={(e) =>
                          setNewAppHeirs((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, age: Number(e.target.value) || 0 } : item
                            )
                          )
                        }
                        placeholder="বয়স"
                        className="col-span-2 px-2 py-1.5 border border-slate-300 rounded-lg bg-white font-mono"
                      />
                      <input
                        type="text"
                        value={h.relation}
                        onChange={(e) =>
                          setNewAppHeirs((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, relation: e.target.value } : item))
                          )
                        }
                        placeholder="সম্পর্ক"
                        className="col-span-2 px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    প্রয়োজনীয় কাগজপত্র সংযুক্তি (এনআইডি / জন্ম নিবন্ধন / দলিল - ঐচ্ছিক)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setNewAppDocName(f.name);
                      setNewAppDocMime(f.type || 'application/pdf');
                      const reader = new FileReader();
                      reader.onload = () => {
                        const resStr = String(reader.result || '');
                        const base64Part = resStr.includes(',') ? resStr.split(',')[1] : resStr;
                        setNewAppDocBase64(base64Part);
                      };
                      reader.readAsDataURL(f);
                    }}
                    className="text-xs text-slate-600"
                  />
                </div>
                <label className="flex items-center gap-2 font-bold text-emerald-900 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={newAppMarkPaid}
                    onChange={(e) => setNewAppMarkPaid(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700"
                  />
                  <span>সরকারি ফি পরিশোধিত (কাউন্টার/অনলাইন)</span>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewAppModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50"
                >
                  বাতিল
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleCreateOfficerApplication(true)}
                    className="px-4 py-2 rounded-xl border border-teal-700 bg-teal-50 hover:bg-teal-100 text-teal-900 font-bold disabled:opacity-50"
                  >
                    খসড়া সংরক্ষণ (Save Draft)
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleCreateOfficerApplication(false)}
                    className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold shadow-sm disabled:opacity-50"
                  >
                    আবেদন দাখিল করুন (Submit)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
