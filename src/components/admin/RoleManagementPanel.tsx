import React, { useCallback, useEffect, useState } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
  GitCompare,
  Award,
  History,
  Plus,
  CheckCircle2,
  XCircle,
  KeyRound,
  UserPlus,
  Clock,
  Lock,
  Save,
} from 'lucide-react';
import {
  AdministrativeUnit,
  ApprovalAuthorityAssignment,
  InitialAdminAccountSummary,
  InitialAdminResetPreviewResponse,
  PermissionAuditLog,
  PermissionKey,
  PermissionScope,
  RbacPermission,
  RbacRole,
  RoleCategory,
  RolePermissionAssignment,
  Service,
  UserAccount,
  UserSession,
} from '../../types';
import { api } from '../../services/api';

interface RoleManagementPanelProps {
  userSession: UserSession;
  institutions: AdministrativeUnit[];
  services: Service[];
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

type SubTab = 'initial_setup' | 'roles' | 'compare' | 'users' | 'authorities' | 'audit';

const SCOPE_OPTIONS: Array<{ value: PermissionScope; label: string }> = [
  { value: 'global', label: 'Global (সমগ্র সিস্টেম)' },
  { value: 'upazila', label: 'Upazila (পাবনা সদর)' },
  { value: 'institution', label: 'Institution (নিজ প্রতিষ্ঠান)' },
  { value: 'department', label: 'Department (নিজ বিভাগ)' },
  { value: 'ward', label: 'Ward (নিজ ওয়ার্ড)' },
  { value: 'assigned', label: 'Assigned (দায়িত্বপ্রাপ্ত)' },
  { value: 'own', label: 'Own (কেবল নিজস্ব)' },
];

interface PendingConfirmation {
  title: string;
  targetLabel: string;
  scopeLabel: string;
  grantedSummary: string[];
  restrictedSummary: string[];
  sensitiveWarnings: string[];
  approvalImpact?: string;
  onConfirm: () => Promise<void>;
}

export const RoleManagementPanel: React.FC<RoleManagementPanelProps> = ({
  userSession,
  institutions,
  services,
  onSuccess,
  onError,
}) => {
  const token = userSession.token || '';
  const canManageRoles = Boolean(userSession.permissions?.['roles.manage'] || userSession.role === 'supervisor');
  const canAssignRoles = Boolean(userSession.permissions?.['users.assign_role'] || canManageRoles);
  const canCreateUsers = Boolean(userSession.permissions?.['users.create'] || canManageRoles);

  const [subTab, setSubTab] = useState<SubTab>('initial_setup');
  const [loading, setLoading] = useState(false);

  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [permissions, setPermissions] = useState<RbacPermission[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [authorities, setAuthorities] = useState<ApprovalAuthorityAssignment[]>([]);
  const [auditLogs, setAuditLogs] = useState<PermissionAuditLog[]>([]);
  const [initialResetPreview, setInitialResetPreview] = useState<InitialAdminResetPreviewResponse | null>(null);
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false);
  const [cleanupReasonBn, setCleanupReasonBn] = useState(
    'প্রারম্ভিক ৪ অ্যাডমিন অ্যাকাউন্ট সেটআপ ও পূর্ববর্তী প্রশাসনিক/টেস্ট অ্যাকাউন্ট নিরাপদ নিষ্ক্রিয়করণ (ঐতিহাসিক রেকর্ড অক্ষুণ্ণ রেখে)'
  );
  const [issuedInvitation, setIssuedInvitation] = useState<{
    user_id: string;
    username: string;
    display_name: string;
    invitation_token: string;
    expires_at: string;
  } | null>(null);
  const [setupPwdTarget, setSetupPwdTarget] = useState<InitialAdminAccountSummary | null>(null);
  const [setupInvitationToken, setSetupInvitationToken] = useState('');
  const [setupNewPassword, setSetupNewPassword] = useState('');
  const [verifyIdentityTarget, setVerifyIdentityTarget] = useState<InitialAdminAccountSummary | null>(null);
  const [verifyIdentityNoteBn, setVerifyIdentityNoteBn] = useState(
    'দাপ্তরিক পরিচয়পত্র, গেজেট/নিয়োগপত্র এবং এনআইডি যাচাইপূর্বক অনুমোদিত'
  );

  // Role editor state
  const [selectedRoleSlug, setSelectedRoleSlug] = useState<string>('chairman');
  const [roleAssignments, setRoleAssignments] = useState<Record<string, { granted: boolean; scope: PermissionScope }>>({});
  const [originalRoleAssignments, setOriginalRoleAssignments] = useState<Record<string, { granted: boolean; scope: PermissionScope }>>({});
  const [editReason, setEditReason] = useState('প্রাতিষ্ঠানিক কর্মপ্রবাহ ও নিরাপত্তা নীতিমালা হালনাগাদ');

  // Create custom role modal
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newRoleSlug, setNewRoleSlug] = useState('');
  const [newRoleNameEn, setNewRoleNameEn] = useState('');
  const [newRoleNameBn, setNewRoleNameBn] = useState('');
  const [newRoleCategory, setNewRoleCategory] = useState<RoleCategory>('custom');
  const [newRoleScope, setNewRoleScope] = useState<PermissionScope>('institution');
  const [newRoleDesc, setNewRoleDesc] = useState('');

  // Compare roles state
  const [compareRoleA, setCompareRoleA] = useState('chairman');
  const [compareRoleB, setCompareRoleB] = useState('secretary');
  const [comparePermsA, setComparePermsA] = useState<RolePermissionAssignment[]>([]);
  const [comparePermsB, setComparePermsB] = useState<RolePermissionAssignment[]>([]);

  // User modals
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [uUsername, setUUsername] = useState('');
  const [uPassword, setUPassword] = useState('Pottoyon@2026!');
  const [uNameBn, setUNameBn] = useState('');
  const [uTitleBn, setUTitleBn] = useState('');
  const [uMobile, setUMobile] = useState('01700-000000');
  const [uPrimaryRole, setUPrimaryRole] = useState('secretary');
  const [uUnitId, setUUnitId] = useState('unit_goyeshpur');
  const [uWards, setUWards] = useState('');
  const [uDepts, setUDepts] = useState('');

  // Assign Role modal
  const [assignRoleUser, setAssignRoleUser] = useState<UserAccount | null>(null);
  const [arRoleSlug, setArRoleSlug] = useState('secretary');
  const [arUnitId, setArUnitId] = useState('unit_goyeshpur');
  const [arWards, setArWards] = useState('');
  const [arDepts, setArDepts] = useState('');
  const [arExpiresAt, setArExpiresAt] = useState('');
  const [arReason, setArReason] = useState('অতিরিক্ত প্রশাসনিক দায়িত্ব অর্পণ');

  // Override modal
  const [overrideUser, setOverrideUser] = useState<UserAccount | null>(null);
  const [ovPermKey, setOvPermKey] = useState<PermissionKey>('applications.verify');
  const [ovScope, setOvScope] = useState<PermissionScope>('institution');
  const [ovEffect, setOvEffect] = useState<'grant' | 'revoke'>('grant');
  const [ovExpiresAt, setOvExpiresAt] = useState('');
  const [ovReason, setOvReason] = useState('সাময়িক প্রশাসনিক প্রয়োজন');

  // Reset Password modal
  const [resetPwdUser, setResetPwdUser] = useState<UserAccount | null>(null);
  const [resetNewPwd, setResetNewPwd] = useState('Pottoyon@2027!');

  // Grant Approval Authority modal
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [aaUserId, setAaUserId] = useState('');
  const [aaRoleSlug, setAaRoleSlug] = useState('chairman');
  const [aaUnitId, setAaUnitId] = useState('unit_goyeshpur');
  const [aaServiceId, setAaServiceId] = useState('srv_warish');
  const [aaMaxFee, setAaMaxFee] = useState('');
  const [aaExpiresAt, setAaExpiresAt] = useState('');
  const [aaNote, setAaNote] = useState('অফিস আদেশ মোতাবেক সীমিত সেবা অনুমোদনের ক্ষমতা অর্পণ');
  const [aaSelfApproval, setAaSelfApproval] = useState(false);

  // Mandatory Pre-Save Confirmation Modal
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmation | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const loadAllRbacData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [rolesData, permsData, usersData] = await Promise.all([
        api.listRbacRoles(token),
        api.listRbacPermissions(token),
        api.listRbacUsers(token).catch(() => []),
      ]);
      setRoles(rolesData);
      setPermissions(permsData);
      setUsers(usersData);
      if (!aaUserId && usersData.length > 0) {
        setAaUserId(usersData[0].id);
      }

      const [authData, logData, resetPreviewData] = await Promise.all([
        api.listApprovalAuthorities(token).catch(() => []),
        api.listPermissionAuditLogs(token).catch(() => []),
        api.getInitialAdminResetPreview(token).catch(() => null),
      ]);
      setAuthorities(authData);
      setAuditLogs(logData);
      if (resetPreviewData) {
        setInitialResetPreview(resetPreviewData);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'RBAC তথ্য লোড করা যায়নি।');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAllRbacData();
  }, [loadAllRbacData]);

  const loadSelectedRolePerms = useCallback(
    async (slug: string) => {
      if (!token || !slug) return;
      try {
        const list = await api.getRolePermissionsV2(token, slug);
        const map: Record<string, { granted: boolean; scope: PermissionScope }> = {};
        for (const p of permissions) {
          map[p.key] = { granted: false, scope: 'institution' };
        }
        for (const item of list) {
          map[item.permission_key] = {
            granted: Boolean(item.granted),
            scope: item.scope,
          };
        }
        setRoleAssignments(map);
        setOriginalRoleAssignments(JSON.parse(JSON.stringify(map)));
      } catch {
        // ignore
      }
    },
    [token, permissions]
  );

  useEffect(() => {
    if (permissions.length > 0 && selectedRoleSlug) {
      loadSelectedRolePerms(selectedRoleSlug);
    }
  }, [permissions.length, selectedRoleSlug, loadSelectedRolePerms]);

  useEffect(() => {
    if (!token || subTab !== 'compare') return;
    Promise.all([
      api.getRolePermissionsV2(token, compareRoleA),
      api.getRolePermissionsV2(token, compareRoleB),
    ])
      .then(([a, b]) => {
        setComparePermsA(a);
        setComparePermsB(b);
      })
      .catch(() => {});
  }, [token, subTab, compareRoleA, compareRoleB]);

  const groupedPermissions = permissions.reduce<Record<string, RbacPermission[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  const selectedRole = roles.find((r) => r.slug === selectedRoleSlug);

  const handleRequestSaveRolePermissions = () => {
    if (!selectedRole) return;
    const grantedNow: string[] = [];
    const restrictedNow: string[] = [];
    const sensitiveWarnings: string[] = [];

    for (const p of permissions) {
      const curr = roleAssignments[p.key];
      const prev = originalRoleAssignments[p.key];
      if (curr?.granted) {
        grantedNow.push(`${p.name_bn} (${curr.scope})`);
        if (p.is_sensitive) {
          sensitiveWarnings.push(`${p.name_bn} [${p.key}] — পরিধি: ${curr.scope}`);
        }
      } else if (prev?.granted && !curr?.granted) {
        restrictedNow.push(`${p.name_bn} (${p.key})`);
      }
    }

    const hasApprove =
      Boolean(roleAssignments['applications.approve']?.granted) ||
      Boolean(roleAssignments['certificates.issue']?.granted);

    setPendingConfirm({
      title: 'রোল পারমিশন পরিবর্তন নিশ্চিতকরণ',
      targetLabel: `${selectedRole.name_bn} (${selectedRole.slug})`,
      scopeLabel: `ডিফল্ট পরিধি: ${selectedRole.default_scope}`,
      grantedSummary: grantedNow,
      restrictedSummary: restrictedNow,
      sensitiveWarnings,
      approvalImpact: hasApprove
        ? 'এই রোলের সনদ অনুমোদন/ইস্যু অনুমতি সক্রিয় থাকছে (তবে চূড়ান্ত ইস্যুর জন্য সেবা-ভিত্তিক অনুমোদন অর্পণও আবশ্যক)।'
        : 'কোনো চূড়ান্ত সনদ অনুমোদন বা ইস্যু ক্ষমতা সক্রিয় নেই।',
      onConfirm: async () => {
        const payload = permissions.map((p) => ({
          permission_key: p.key,
          scope: roleAssignments[p.key]?.scope || selectedRole.default_scope,
          granted: Boolean(roleAssignments[p.key]?.granted),
        }));
        await api.updateRolePermissionsV2(token, selectedRole.slug, payload, editReason);
        onSuccess(`${selectedRole.name_bn} এর পারমিশন সফলভাবে সংরক্ষণ ও অডিট লগে নথিভুক্ত হয়েছে।`);
        await loadAllRbacData();
        await loadSelectedRolePerms(selectedRole.slug);
      },
    });
  };

  const handleCreateCustomRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createRbacRole(token, {
        slug: newRoleSlug.trim(),
        name_en: newRoleNameEn.trim(),
        name_bn: newRoleNameBn.trim(),
        category: newRoleCategory,
        default_scope: newRoleScope,
        description_bn: newRoleDesc.trim() || newRoleNameBn.trim(),
        assignments: [{ permission_key: 'dashboard.view', scope: newRoleScope }],
      });
      setNewRoleOpen(false);
      setNewRoleSlug('');
      setNewRoleNameEn('');
      setNewRoleNameBn('');
      setNewRoleDesc('');
      setSelectedRoleSlug(created.slug);
      onSuccess(`নতুন কাস্টম রোল "${created.name_bn}" তৈরি করা হয়েছে।`);
      await loadAllRbacData();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'রোল তৈরি ব্যর্থ হয়েছে।');
    }
  };

  const handleToggleRoleActive = async (r: RbacRole) => {
    try {
      await api.toggleRbacRoleStatus(token, r.slug, !r.is_active);
      onSuccess(`${r.name_bn} রোলটি ${!r.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'} করা হয়েছে।`);
      await loadAllRbacData();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'রোল স্ট্যাটাস পরিবর্তন ব্যর্থ।');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const wards = uWards
        .split(',')
        .map((x) => parseInt(x.trim(), 10))
        .filter((n) => Number.isFinite(n));
      const depts = uDepts
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      await api.createRbacUser(token, {
        username: uUsername.trim(),
        password: uPassword,
        name_bn: uNameBn.trim(),
        title_bn: uTitleBn.trim(),
        mobile: uMobile.trim(),
        primary_role: uPrimaryRole,
        administrative_unit_id: uUnitId || null,
        ward_nos: wards.length ? wards : undefined,
        departments: depts.length ? depts : undefined,
      });
      setCreateUserOpen(false);
      setUUsername('');
      setUNameBn('');
      setUTitleBn('');
      onSuccess('নতুন কর্মকর্তা/ব্যবহারকারী একাউন্ট সফলভাবে তৈরি হয়েছে।');
      await loadAllRbacData();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'ব্যবহারকারী তৈরি ব্যর্থ হয়েছে।');
    }
  };

  const handleRequestAssignRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignRoleUser) return;
    const roleObj = roles.find((r) => r.slug === arRoleSlug);
    const instObj = institutions.find((i) => i.id === arUnitId);
    const wards = arWards
      .split(',')
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => Number.isFinite(n));
    const depts = arDepts
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

    setPendingConfirm({
      title: 'অতিরিক্ত/নতুন রোল ও অধিক্ষেত্র বরাদ্দ নিশ্চিত করুন',
      targetLabel: `${assignRoleUser.name_bn} (@${assignRoleUser.username})`,
      scopeLabel: `${instObj?.name_bn || 'গ্লোবাল/উপজেলা'}${wards.length ? ` • ওয়ার্ড: ${wards.join(', ')}` : ''}${
        depts.length ? ` • বিভাগ: ${depts.join(', ')}` : ''
      }`,
      grantedSummary: [`নতুন রোল: ${roleObj?.name_bn || arRoleSlug}`, arExpiresAt ? `মেয়াদ শেষ: ${arExpiresAt}` : 'মেয়াদ: স্থায়ী'],
      restrictedSummary: [],
      sensitiveWarnings:
        arRoleSlug === 'supervisor' || arRoleSlug === 'chairman'
          ? [`উচ্চ-অধিকার রোল (${arRoleSlug}) বরাদ্দ করা হচ্ছে।`]
          : [],
      onConfirm: async () => {
        await api.assignUserRoleAndScope(token, assignRoleUser.id, {
          role_slug: arRoleSlug,
          administrative_unit_id: arUnitId || null,
          ward_nos: wards.length ? wards : undefined,
          departments: depts.length ? depts : undefined,
          expires_at: arExpiresAt ? new Date(arExpiresAt).toISOString() : null,
          reason_bn: arReason,
        });
        setAssignRoleUser(null);
        onSuccess(`${assignRoleUser.name_bn} কে নতুন রোল (${roleObj?.name_bn || arRoleSlug}) বরাদ্দ করা হয়েছে।`);
        await loadAllRbacData();
      },
    });
  };

  const handleRequestCreateOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideUser) return;
    const permObj = permissions.find((p) => p.key === ovPermKey);
    setPendingConfirm({
      title: 'ব্যক্তিগত পারমিশন ওভাররাইড নিশ্চিতকরণ',
      targetLabel: `${overrideUser.name_bn} (@${overrideUser.username})`,
      scopeLabel: `পরিধি: ${ovScope} • ধরন: ${ovEffect === 'grant' ? 'অনুমতি প্রদান (GRANT)' : 'অনুমতি বাতিল (REVOKE)'}`,
      grantedSummary:
        ovEffect === 'grant'
          ? [`${permObj?.name_bn || ovPermKey} (${ovScope})`, ovExpiresAt ? `মেয়াদ: ${ovExpiresAt}` : 'মেয়াদ: অনির্দিষ্ট']
          : [],
      restrictedSummary: ovEffect === 'revoke' ? [`${permObj?.name_bn || ovPermKey} নিষিদ্ধ করা হবে`] : [],
      sensitiveWarnings:
        ovEffect === 'grant' && permObj?.is_sensitive
          ? [`সংবেদনশীল পারমিশন "${permObj.name_bn}" সরাসরি প্রদান করা হচ্ছে।`]
          : [],
      onConfirm: async () => {
        await api.createUserOverride(token, overrideUser.id, {
          permission_key: ovPermKey,
          scope: ovScope,
          effect: ovEffect,
          expires_at: ovExpiresAt ? new Date(ovExpiresAt).toISOString() : null,
          reason_bn: ovReason,
        });
        setOverrideUser(null);
        onSuccess(`${overrideUser.name_bn} এর জন্য পারমিশন ওভাররাইড সংরক্ষিত হয়েছে।`);
        await loadAllRbacData();
      },
    });
  };

  const handleRequestGrantAuthority = (e: React.FormEvent) => {
    e.preventDefault();
    const targetUser = users.find((u) => u.id === aaUserId);
    const instObj = institutions.find((i) => i.id === aaUnitId);
    const srvObj = services.find((s) => s.id === aaServiceId);
    const parsedLimit = aaMaxFee.trim() ? Number(aaMaxFee.trim()) : null;

    setPendingConfirm({
      title: 'সেবা-ভিত্তিক সনদ অনুমোদন ক্ষমতা অর্পণ নিশ্চিত করুন',
      targetLabel: `${targetUser?.name_bn || aaUserId} (${aaRoleSlug})`,
      scopeLabel: `${instObj?.name_bn || aaUnitId} • সেবা: ${aaServiceId === '*' ? 'সকল সেবা (*)' : srvObj?.name_bn || aaServiceId}`,
      grantedSummary: [
        `চূড়ান্ত অনুমোদন ও QR সনদ স্বাক্ষর ক্ষমতা`,
        parsedLimit ? `সর্বোচ্চ ফি সীমা: ৳${parsedLimit}` : 'ফি সীমা: প্রযোজ্য নয়',
        aaExpiresAt ? `মেয়াদ শেষ: ${aaExpiresAt}` : 'মেয়াদ: অনির্দিষ্ট',
      ],
      restrictedSummary: aaSelfApproval ? [] : ['স্বার্থের সংঘাত (Self-Approval) সুরক্ষার জন্য নিজ আবেদন অনুমোদন নিষিদ্ধ'],
      sensitiveWarnings: ['আইনি সনদ ও ডিজিটাল স্বাক্ষর ইস্যু করার সংবেদনশীল ক্ষমতা প্রদান করা হচ্ছে।'],
      approvalImpact: `প্রতিষ্ঠান: ${instObj?.name_bn || aaUnitId} | সেবা: ${aaServiceId}`,
      onConfirm: async () => {
        await api.grantApprovalAuthority(token, {
          user_id: aaUserId,
          role_slug: aaRoleSlug,
          administrative_unit_id: aaUnitId,
          service_id: aaServiceId,
          max_fee_limit: parsedLimit,
          expires_at: aaExpiresAt ? new Date(aaExpiresAt).toISOString() : null,
          delegation_note_bn: aaNote,
          allow_self_approval: aaSelfApproval,
        });
        setAuthModalOpen(false);
        onSuccess(`অনুমোদন ক্ষমতা সফলভাবে অর্পণ ও অডিট লগে সংরক্ষণ করা হয়েছে।`);
        await loadAllRbacData();
      },
    });
  };

  const executeConfirmedAction = async () => {
    if (!pendingConfirm) return;
    setConfirmBusy(true);
    try {
      await pendingConfirm.onConfirm();
      setPendingConfirm(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 min-w-0 max-w-full text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-700" />
            <span>রোল, পারমিশন ও অনুমোদন ক্ষমতা ব্যবস্থাপনা (RBAC)</span>
          </h2>
          <p className="text-slate-500 mt-0.5">
            ৪টি প্রশাসনিক রোল (UP Chairman, UP Secretary, Developer, Supervisor), ৫৩টি সূক্ষ্ম পারমিশন এবং সেবা-ভিত্তিক সনদ অনুমোদন নিয়ন্ত্রণ
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'initial_setup' as SubTab, label: 'প্রারম্ভিক ৪ অ্যাডমিন ও রিসেট', icon: KeyRound },
            { id: 'roles' as SubTab, label: 'রোল ও পারমিশন', icon: ShieldCheck },
            { id: 'compare' as SubTab, label: 'রোল তুলনা', icon: GitCompare },
            { id: 'users' as SubTab, label: 'ব্যবহারকারী ও ওভাররাইড', icon: Users },
            { id: 'authorities' as SubTab, label: 'সনদ অনুমোদন ক্ষমতা', icon: Award },
            { id: 'audit' as SubTab, label: 'পারমিশন অডিট লগ', icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-colors ${
                  subTab === tab.id
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading && roles.length === 0 && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500">
          RBAC ম্যাট্রিক্স ও ব্যবহারকারী তথ্য লোড হচ্ছে...
        </div>
      )}

      {/* SUB-TAB 0: INITIAL 4 ADMIN ACCOUNT SETUP & SAFE NON-DESTRUCTIVE ACCOUNT RESET */}
      {subTab === 'initial_setup' && initialResetPreview && (
        <div className="space-y-5">
          {/* Preserved Records & Safety Guarantee Banner */}
          <div className="bg-emerald-950 text-white rounded-2xl p-5 border border-emerald-800 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-800/80 text-emerald-200 text-[11px] font-bold mb-2">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>নিরাপদ অ্যাকাউন্ট রিসেট ও ৪ প্রারম্ভিক অ্যাডমিন অ্যাকাউন্ট সেটআপ</span>
                </div>
                <h3 className="text-base font-bold">
                  কোনো ঐতিহাসিক আবেদন, সনদ, পেমেন্ট বা অডিট লগ ডিলিট না করেই নিরাপদ অ্যাকাউন্ট ক্লিনআপ
                </h3>
                <p className="text-emerald-200/90 text-[11px] mt-1">
                  নিষ্ক্রিয়কৃত কর্মকর্তাদের পূর্বে অনুমোদিত সনদ, আবেদন ও অডিট ট্রেইল ডাটাবেজে সম্পূর্ণ অক্ষুণ্ণ থাকবে। ক্লিনআপ কার্যকরের পূর্বে স্বয়ংক্রিয়ভাবে ডাটাবেজের পূর্ণাঙ্গ ভেরিফায়েড ব্যাকআপ সংরক্ষিত হয়।
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 shrink-0">
                <div className="bg-emerald-900/70 border border-emerald-800 rounded-xl px-3 py-2 text-center">
                  <div className="text-[10px] text-emerald-300">নাগরিক অ্যাকাউন্ট</div>
                  <div className="text-base font-extrabold">{initialResetPreview.preserved_records_summary.citizen_accounts_count}</div>
                </div>
                <div className="bg-emerald-900/70 border border-emerald-800 rounded-xl px-3 py-2 text-center">
                  <div className="text-[10px] text-emerald-300">সংরক্ষিত আবেদন</div>
                  <div className="text-base font-extrabold">{initialResetPreview.preserved_records_summary.applications_count}</div>
                </div>
                <div className="bg-emerald-900/70 border border-emerald-800 rounded-xl px-3 py-2 text-center">
                  <div className="text-[10px] text-emerald-300">ইস্যুকৃত সনদ</div>
                  <div className="text-base font-extrabold">{initialResetPreview.preserved_records_summary.certificates_count}</div>
                </div>
                <div className="bg-emerald-900/70 border border-emerald-800 rounded-xl px-3 py-2 text-center">
                  <div className="text-[10px] text-emerald-300">পেমেন্ট রেকর্ড</div>
                  <div className="text-base font-extrabold">{initialResetPreview.preserved_records_summary.payments_count}</div>
                </div>
                <div className="bg-emerald-900/70 border border-emerald-800 rounded-xl px-3 py-2 text-center">
                  <div className="text-[10px] text-emerald-300">অডিট লগ</div>
                  <div className="text-base font-extrabold">{initialResetPreview.preserved_records_summary.audit_logs_count}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Initial Admin Accounts Grid */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  অনুমোদিত ৪টি প্রারম্ভিক প্রশাসনিক অ্যাকাউন্ট (Initial Four Admin Accounts)
                </h3>
                <p className="text-[11px] text-slate-500">
                  কোনো ডিফল্ট পাসওয়ার্ড সংরক্ষিত নেই। এককালীন আমন্ত্রণ টোকেনের মাধ্যমে শক্তিশালী পাসওয়ার্ড সেটআপ এবং দাপ্তরিক পরিচয় যাচাই (Identity Verification) সম্পন্ন হলে লগইন সক্রিয় হবে।
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-bold text-[11px]">
                মোট ৪টি প্রারম্ভিক অ্যাডমিন অ্যাকাউন্ট
              </span>
            </div>

            {issuedInvitation && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-950">
                    এককালীন পাসওয়ার্ড সেটআপ আমন্ত্রণ টোকেন প্রস্তুত ({issuedInvitation.display_name} — @{issuedInvitation.username})
                  </span>
                  <button
                    type="button"
                    onClick={() => setIssuedInvitation(null)}
                    className="text-amber-800 hover:text-amber-950 font-bold text-[11px]"
                  >
                    বন্ধ করুন
                  </button>
                </div>
                <div className="font-mono text-xs bg-white border border-amber-200 px-3 py-2 rounded-lg select-all break-all text-slate-900">
                  {issuedInvitation.invitation_token}
                </div>
                <p className="text-[11px] text-amber-800">
                  নিরাপত্তা নীতিমালা অনুযায়ী এই টোকেনটি কেবলমাত্র SHA-256 হ্যাশ হিসেবে ডাটাবেজে সংরক্ষিত থাকে এবং অডিট লগে কখনোই প্রদর্শিত হয় না। মেয়াদ: {new Date(issuedInvitation.expires_at).toLocaleString('bn-BD')}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {initialResetPreview.initial_four_accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono font-bold text-[10px] mb-1">
                          {acc.role_label}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900">{acc.display_name}</h4>
                        <div className="text-[11px] text-slate-600">
                          ইউজারনেম: <span className="font-mono font-semibold text-slate-800">{acc.username}</span>
                          {acc.email ? ` • ইমেইল: ${acc.email}` : ''}
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg font-bold text-[10px] shrink-0 ${
                          acc.account_status === 'active' && acc.identity_verified && acc.is_active
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}
                      >
                        {acc.account_status === 'active' && acc.identity_verified && acc.is_active
                          ? 'Active (সক্রিয়)'
                          : 'Pending Identity Verification'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-white p-2.5 rounded-lg border border-slate-200">
                      <div>
                        <span className="text-slate-500 block">প্রতিষ্ঠান / পরিধি:</span>
                        <span className="font-bold text-slate-800">{acc.institution_name}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">প্রতিষ্ঠানের ধরন:</span>
                        <span className="font-bold text-slate-800">{acc.institution_type}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">পাসওয়ার্ড সেটআপ:</span>
                        <span className={acc.has_password_set ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>
                          {acc.has_password_set ? 'সম্পন্ন (Scrypt Hash)' : 'আমন্ত্রণ টোকেন আবশ্যক'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">পরিচয় ও MFA নিরাপত্তা:</span>
                        <span className="font-bold text-slate-800">
                          {acc.identity_verified ? 'যাচাইকৃত' : 'যাচাই অপেক্ষমাণ'} • MFA: {acc.mfa_enabled ? 'বাধ্যতামূলক' : 'ঐচ্ছিক'}
                        </span>
                      </div>
                    </div>

                    {acc.appointment_note_bn && (
                      <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200 text-[11px] text-amber-950">
                        <strong>দাপ্তরিক নোট:</strong> {acc.appointment_note_bn}
                      </div>
                    )}
                  </div>

                  {canManageRoles && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const inv = await api.issueAccountInvitationToken(token, acc.id, 24);
                            setIssuedInvitation(inv);
                            setSetupPwdTarget(acc);
                            setSetupInvitationToken(inv.invitation_token);
                            setSetupNewPassword('');
                            onSuccess(`${acc.display_name} এর জন্য এককালীন আমন্ত্রণ টোকেন তৈরি হয়েছে।`);
                            await loadAllRbacData();
                          } catch (err) {
                            onError(err instanceof Error ? err.message : 'আমন্ত্রণ টোকেন ইস্যু ব্যর্থ হয়েছে।');
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-[11px]"
                      >
                        ১. এককালীন আমন্ত্রণ টোকেন ইস্যু
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSetupPwdTarget(acc);
                          if (issuedInvitation && issuedInvitation.user_id === acc.id) {
                            setSetupInvitationToken(issuedInvitation.invitation_token);
                          } else {
                            setSetupInvitationToken('');
                          }
                          setSetupNewPassword('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold text-[11px]"
                      >
                        ২. পাসওয়ার্ড সেটআপ
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setVerifyIdentityTarget(acc);
                          setVerifyIdentityNoteBn(
                            'দাপ্তরিক পরিচয়পত্র, গেজেট/নিয়োগপত্র এবং এনআইডি যাচাইপূর্বক অনুমোদিত'
                          );
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px]"
                      >
                        ৩. পরিচয় যাচাই ও সক্রিয়করণ
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pre-Cleanup Summary of Existing Administrative/Test Accounts to be Deactivated */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  নিষ্ক্রিয়করণযোগ্য পূর্ববর্তী প্রশাসনিক ও টেস্ট অ্যাকাউন্টের তালিকা ({initialResetPreview.accounts_to_be_deactivated.length}টি)
                </h3>
                <p className="text-[11px] text-slate-500">
                  নিচের অ্যাকাউন্টগুলো স্থায়ীভাবে ডিলিট করা হবে না; শুধুমাত্র লগইন ও সেশন নিষ্ক্রিয় (Deactivate) করা হবে যাতে ঐতিহাসিক আবেদন ও সনদের রেফারেন্স অক্ষুণ্ণ থাকে।
                </p>
              </div>
              {canManageRoles && (
                <button
                  type="button"
                  onClick={() => setCleanupConfirmOpen(true)}
                  className="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs flex items-center gap-1.5 shrink-0"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>
                    {initialResetPreview.cleanup_already_executed
                      ? 'পুনরায় ব্যাকআপ ও নিষ্ক্রিয়করণ যাচাই করুন'
                      : 'তালিকা পর্যালোচনা ও নিরাপদ ক্লিনআপ নিশ্চিত করুন'}
                  </span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 sticky top-0">
                  <tr>
                    <th className="p-2.5 border-b border-slate-200">ইউজারনেম</th>
                    <th className="p-2.5 border-b border-slate-200">নাম ও পদবি</th>
                    <th className="p-2.5 border-b border-slate-200">রোল</th>
                    <th className="p-2.5 border-b border-slate-200">প্রতিষ্ঠান</th>
                    <th className="p-2.5 border-b border-slate-200">ঐতিহাসিক আবেদন</th>
                    <th className="p-2.5 border-b border-slate-200">বর্তমান অবস্থা</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {initialResetPreview.accounts_to_be_deactivated.map((cand) => (
                    <tr key={cand.id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-mono font-semibold text-slate-800">{cand.username}</td>
                      <td className="p-2.5">
                        <div className="font-bold text-slate-900">{cand.name_bn}</div>
                        <div className="text-[10px] text-slate-500">{cand.title_bn}</div>
                      </td>
                      <td className="p-2.5 font-mono uppercase text-[10px] text-slate-700">{cand.primary_role}</td>
                      <td className="p-2.5 text-slate-700">{cand.institution_name_bn}</td>
                      <td className="p-2.5 font-bold text-slate-800">{cand.historical_applications_count}টি সংরক্ষিত</td>
                      <td className="p-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            cand.is_active && cand.account_status !== 'deactivated'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {cand.is_active && cand.account_status !== 'deactivated'
                            ? 'নিষ্ক্রিয়করণের অপেক্ষায়'
                            : 'নিষ্ক্রিয় (Deactivated)'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 1: ROLES & PERMISSION MATRIX */}
      {subTab === 'roles' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Role List Sidebar */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <span className="font-bold text-slate-900">সিস্টেম ও কাস্টম রোল ({roles.length})</span>
              {canManageRoles && (
                <button
                  type="button"
                  onClick={() => setNewRoleOpen(true)}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 text-[11px]"
                >
                  <Plus className="w-3 h-3" />
                  <span>নতুন রোল</span>
                </button>
              )}
            </div>

            <div className="divide-y divide-slate-100 max-h-[650px] overflow-y-auto">
              {roles.map((r) => (
                <div
                  key={r.slug}
                  onClick={() => setSelectedRoleSlug(r.slug)}
                  className={`p-3 cursor-pointer transition-colors ${
                    selectedRoleSlug === r.slug ? 'bg-emerald-50 border-l-4 border-emerald-700' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{r.name_bn}</span>
                        {r.is_optional && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px]">ঐচ্ছিক</span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {r.slug} • পরিধি: {r.default_scope}
                      </div>
                    </div>

                    {canManageRoles && r.slug !== 'supervisor' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleRoleActive(r);
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {r.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{r.description_bn}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Granular Permission Editor */}
          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            {selectedRole ? (
              <div>
                <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">{selectedRole.name_bn}</h3>
                      <span className="font-mono text-[11px] bg-white border border-slate-200 px-2 py-0.5 rounded">
                        {selectedRole.slug}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">{selectedRole.description_bn}</p>
                  </div>

                  {canManageRoles && (
                    <button
                      type="button"
                      onClick={handleRequestSaveRolePermissions}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shrink-0 shadow-xs"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>পারমিশন সংরক্ষণ (নিশ্চিতকরণসহ)</span>
                    </button>
                  )}
                </div>

                {canManageRoles && (
                  <div className="px-4 py-2.5 bg-amber-50/70 border-b border-amber-100 flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="font-bold text-amber-900 shrink-0">পরিবর্তনের কারণ (অডিট লগ):</span>
                    <input
                      type="text"
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-white"
                    />
                  </div>
                )}

                <div className="p-4 space-y-4 max-h-[580px] overflow-y-auto">
                  {Object.entries(groupedPermissions).map(([moduleName, perms]) => (
                    <div key={moduleName} className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-3.5 py-2 bg-slate-100 font-bold text-slate-800 flex items-center justify-between">
                        <span>মডিউল: {moduleName}</span>
                        <span className="text-[10px] text-slate-500">
                          {perms.filter((p) => roleAssignments[p.key]?.granted).length} / {perms.length} সক্রিয়
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {perms.map((p) => {
                          const state = roleAssignments[p.key] || {
                            granted: false,
                            scope: selectedRole.default_scope,
                          };
                          return (
                            <div
                              key={p.key}
                              className="px-3.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/70"
                            >
                              <label className="flex items-start gap-2.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  disabled={!canManageRoles}
                                  checked={state.granted}
                                  onChange={(e) =>
                                    setRoleAssignments((prev) => ({
                                      ...prev,
                                      [p.key]: { ...state, granted: e.target.checked },
                                    }))
                                  }
                                  className="mt-0.5"
                                />
                                <div>
                                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                    <span>{p.name_bn}</span>
                                    {p.is_sensitive && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-red-50 border border-red-200 text-red-700 text-[9px] font-bold">
                                        <ShieldAlert className="w-2.5 h-2.5" />
                                        সংবেদনশীল
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-400">
                                    {p.key} — {p.name_en}
                                  </div>
                                </div>
                              </label>

                              <select
                                disabled={!canManageRoles || !state.granted}
                                value={state.scope}
                                onChange={(e) =>
                                  setRoleAssignments((prev) => ({
                                    ...prev,
                                    [p.key]: { ...state, scope: e.target.value as PermissionScope },
                                  }))
                                }
                                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-semibold text-[11px] disabled:opacity-40"
                              >
                                {SCOPE_OPTIONS.map((sc) => (
                                  <option key={sc.value} value={sc.value}>
                                    {sc.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: COMPARE ROLES */}
      {subTab === 'compare' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-2xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">প্রথম রোল নির্বাচন করুন</label>
              <select
                value={compareRoleA}
                onChange={(e) => setCompareRoleA(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
              >
                {roles.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name_bn} ({r.slug})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">দ্বিতীয় রোল নির্বাচন করুন</label>
              <select
                value={compareRoleB}
                onChange={(e) => setCompareRoleB(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
              >
                {roles.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name_bn} ({r.slug})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="horizontal-scroll-table border border-slate-200 rounded-xl">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-800">
                <tr>
                  <th className="py-2.5 px-3">পারমিশন</th>
                  <th className="py-2.5 px-3">{roles.find((r) => r.slug === compareRoleA)?.name_bn || compareRoleA}</th>
                  <th className="py-2.5 px-3">{roles.find((r) => r.slug === compareRoleB)?.name_bn || compareRoleB}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {permissions.map((p) => {
                  const a = comparePermsA.find((x) => x.permission_key === p.key && x.granted);
                  const b = comparePermsB.find((x) => x.permission_key === p.key && x.granted);
                  const diff = Boolean(a) !== Boolean(b) || a?.scope !== b?.scope;
                  return (
                    <tr key={p.key} className={diff ? 'bg-amber-50/40' : ''}>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-slate-900">{p.name_bn}</div>
                        <div className="text-[10px] font-mono text-slate-400">{p.key}</div>
                      </td>
                      <td className="py-2 px-3">
                        {a ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                            ✓ {a.scope}
                          </span>
                        ) : (
                          <span className="text-slate-400">— নিষিদ্ধ</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {b ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                            ✓ {b.scope}
                          </span>
                        ) : (
                          <span className="text-slate-400">— নিষিদ্ধ</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: USERS, MULTI-ROLE & OVERRIDES */}
      {subTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">ব্যবহারকারী, বহু-রোল ও সাময়িক পারমিশন ওভাররাইড ({users.length})</h3>
              <p className="text-slate-500">প্রতিষ্ঠান, ওয়ার্ড ও বিভাগ ভিত্তিক দায়িত্ব এবং মেয়াদোত্তীর্ণযোগ্য পারমিশন নিয়ন্ত্রণ</p>
            </div>
            {canCreateUsers && (
              <button
                type="button"
                onClick={() => setCreateUserOpen(true)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                <span>নতুন কর্মকর্তা একাউন্ট</span>
              </button>
            )}
          </div>

          <div className="space-y-3">
            {users.slice(0, 40).map((u) => (
              <div key={u.id} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{u.name_bn}</span>
                      <span className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                        @{u.username}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {u.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                      </span>
                      {u.locked_until && new Date(u.locked_until).getTime() > Date.now() && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          লককৃত
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {u.title_bn} • {institutions.find((i) => i.id === u.administrative_unit_id)?.name_bn || 'কেন্দ্রীয় / পাবলিক'}
                      {u.wards && u.wards.length > 0 ? ` • ওয়ার্ড: ${u.wards.join(', ')}` : ''}
                      {u.departments && u.departments.length > 0 ? ` • বিভাগ: ${u.departments.join(', ')}` : ''}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {canAssignRoles && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setAssignRoleUser(u);
                            setArUnitId(u.administrative_unit_id || 'unit_goyeshpur');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-200"
                        >
                          + রোল/অধিক্ষেত্র
                        </button>
                        <button
                          type="button"
                          onClick={() => setOverrideUser(u)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold border border-blue-200"
                        >
                          + সাময়িক/বাতিল ওভাররাইড
                        </button>
                      </>
                    )}
                    {canManageRoles && u.id !== userSession.user_id && (
                      <>
                        <button
                          type="button"
                          onClick={() => setResetPwdUser(u)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold flex items-center gap-1"
                        >
                          <KeyRound className="w-3 h-3" />
                          <span>পাসওয়ার্ড</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.toggleRbacUserStatus(token, u.id, !u.is_active);
                              onSuccess(`${u.name_bn} এর স্ট্যাটাস আপডেট হয়েছে।`);
                              await loadAllRbacData();
                            } catch (err) {
                              onError(err instanceof Error ? err.message : 'ব্যর্থ হয়েছে।');
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold hover:bg-slate-50"
                        >
                          {u.is_active ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Active role assignments & overrides */}
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {(u.roles || []).map((ur) => (
                    <span
                      key={ur.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 font-semibold"
                    >
                      <span>{roles.find((r) => r.slug === ur.role_slug)?.name_bn || ur.role_slug}</span>
                      {ur.administrative_unit_id && (
                        <span className="text-slate-500">
                          ({institutions.find((i) => i.id === ur.administrative_unit_id)?.code || ur.administrative_unit_id})
                        </span>
                      )}
                      {ur.expires_at && (
                        <span className="text-amber-700 font-mono flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          {new Date(ur.expires_at).toLocaleDateString('bn-BD')}
                        </span>
                      )}
                      {canAssignRoles && !ur.is_primary && (
                        <button
                          type="button"
                          onClick={async () => {
                            await api.revokeUserRole(token, u.id, ur.id);
                            onSuccess('রোল বরাদ্দ প্রত্যাহার করা হয়েছে।');
                            await loadAllRbacData();
                          }}
                          className="text-red-600 hover:text-red-800 font-bold ml-1"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))}

                  {(u.overrides || []).map((ov) => (
                    <span
                      key={ov.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-semibold ${
                        ov.effect === 'grant'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-red-50 border-red-200 text-red-900'
                      }`}
                    >
                      <span>
                        {ov.effect === 'grant' ? '+ সাময়িক:' : '− বাতিল:'} {ov.permission_key} ({ov.scope})
                      </span>
                      {ov.expires_at && (
                        <span className="font-mono text-[10px]">
                          [{new Date(ov.expires_at).toLocaleDateString('bn-BD')}]
                        </span>
                      )}
                      {canAssignRoles && (
                        <button
                          type="button"
                          onClick={async () => {
                            await api.revokeUserOverride(token, u.id, ov.id);
                            onSuccess('পারমিশন ওভাররাইড অপসারণ হয়েছে।');
                            await loadAllRbacData();
                          }}
                          className="font-bold ml-1"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: SERVICE-SPECIFIC APPROVAL AUTHORITIES */}
      {subTab === 'authorities' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">সেবা-ভিত্তিক সনদ অনুমোদন ক্ষমতা ({authorities.length})</h3>
              <p className="text-slate-500">
                চূড়ান্ত সনদ অনুমোদন কেবল রোল দিয়েই নয়, নির্দিষ্ট প্রতিষ্ঠান ও সেবার অনুমোদন অর্পণ (Delegation) দ্বারা নিয়ন্ত্রিত
              </p>
            </div>
            {canManageRoles && (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>অনুমোদন ক্ষমতা অর্পণ</span>
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="horizontal-scroll-table">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">কর্মকর্তা ও রোল</th>
                    <th className="py-2.5 px-3">প্রতিষ্ঠান</th>
                    <th className="py-2.5 px-3">অনুমোদিত সেবা</th>
                    <th className="py-2.5 px-3">ফি সীমা ও মেয়াদ</th>
                    <th className="py-2.5 px-3">নোট</th>
                    {canManageRoles && <th className="py-2.5 px-3 text-right">পদক্ষেপ</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {authorities.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{a.user_name_bn || a.user_id}</div>
                        <div className="text-[10px] font-mono text-slate-500">{a.role_slug}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        {institutions.find((i) => i.id === a.administrative_unit_id)?.name_bn || a.administrative_unit_id}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-900">
                        {a.service_id === '*'
                          ? 'সকল সেবা (*)'
                          : services.find((s) => s.id === a.service_id)?.name_bn || a.service_id}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px]">
                        <div>{a.max_fee_limit ? `সর্বোচ্চ ৳${a.max_fee_limit}` : 'সীমাহীন'}</div>
                        <div className="text-slate-500">
                          {a.expires_at ? `মেয়াদ: ${new Date(a.expires_at).toLocaleDateString('bn-BD')}` : 'স্থায়ী'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs">{a.delegation_note_bn}</td>
                      {canManageRoles && (
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              await api.revokeApprovalAuthority(token, a.id);
                              onSuccess('অনুমোদন ক্ষমতা প্রত্যাহার করা হয়েছে।');
                              await loadAllRbacData();
                            }}
                            className="px-2.5 py-1 rounded bg-red-50 border border-red-200 text-red-700 font-bold"
                          >
                            প্রত্যাহার
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: PERMISSION AUDIT LOGS */}
      {subTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">রোল ও পারমিশন পরিবর্তন অডিট লগ ({auditLogs.length})</h3>
          </div>
          <div className="horizontal-scroll-table">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-800">
                <tr>
                  <th className="py-2.5 px-3">সময়</th>
                  <th className="py-2.5 px-3">সম্পাদনকারী</th>
                  <th className="py-2.5 px-3">কার্যক্রম</th>
                  <th className="py-2.5 px-3">লক্ষ্য (Target)</th>
                  <th className="py-2.5 px-3">কারণ ও বিবরণ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                      {new Date(log.created_at).toLocaleString('bn-BD')}
                    </td>
                    <td className="py-2 px-3">
                      <span className="font-bold text-slate-900">{log.actor_name_bn}</span>{' '}
                      <span className="font-mono text-[10px] text-slate-500">({log.actor_role})</span>
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-emerald-800">{log.action_type}</td>
                    <td className="py-2 px-3 font-mono text-slate-700">
                      {log.target_type}: {log.target_id}
                    </td>
                    <td className="py-2 px-3 text-slate-600">{log.reason_bn}</td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      এখনো কোনো পারমিশন পরিবর্তন লগ রেকর্ড হয়নি।
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE CUSTOM ROLE MODAL */}
      {newRoleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleCreateCustomRole} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">নতুন কাস্টম রোল তৈরি</h3>
            <div>
              <label className="font-bold block mb-1">রোল স্লাগ (ইংরেজি, lowercase) *</label>
              <input
                type="text"
                required
                value={newRoleSlug}
                onChange={(e) => setNewRoleSlug(e.target.value)}
                placeholder="e.g. ward_verifier_assistant"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">নাম (বাংলা) *</label>
                <input
                  type="text"
                  required
                  value={newRoleNameBn}
                  onChange={(e) => setNewRoleNameBn(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">নাম (ইংরেজি) *</label>
                <input
                  type="text"
                  required
                  value={newRoleNameEn}
                  onChange={(e) => setNewRoleNameEn(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">ক্যাটাগরি</label>
                <select
                  value={newRoleCategory}
                  onChange={(e) => setNewRoleCategory(e.target.value as RoleCategory)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  <option value="custom">কাস্টম</option>
                  <option value="union_parishad">ইউনিয়ন পরিষদ</option>
                  <option value="municipality">পৌরসভা</option>
                  <option value="upazila">উপজেলা</option>
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">ডিফল্ট পরিধি</label>
                <select
                  value={newRoleScope}
                  onChange={(e) => setNewRoleScope(e.target.value as PermissionScope)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  {SCOPE_OPTIONS.map((sc) => (
                    <option key={sc.value} value={sc.value}>
                      {sc.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="font-bold block mb-1">বিবরণ</label>
              <textarea
                rows={2}
                value={newRoleDesc}
                onChange={(e) => setNewRoleDesc(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setNewRoleOpen(false)} className="px-4 py-2 rounded-xl border border-slate-300 font-bold">
                বাতিল
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold">
                তৈরি করুন
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CREATE USER MODAL */}
      {createUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleCreateUser} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">নতুন ব্যবহারকারী একাউন্ট</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">ইউজারনেম *</label>
                <input
                  type="text"
                  required
                  value={uUsername}
                  onChange={(e) => setUUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">পাসওয়ার্ড (৮+ অক্ষর ও সংখ্যা) *</label>
                <input
                  type="password"
                  required
                  value={uPassword}
                  onChange={(e) => setUPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">পূর্ণ নাম (বাংলা) *</label>
                <input
                  type="text"
                  required
                  value={uNameBn}
                  onChange={(e) => setUNameBn(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">পদবি *</label>
                <input
                  type="text"
                  required
                  value={uTitleBn}
                  onChange={(e) => setUTitleBn(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">প্রাথমিক রোল *</label>
                <select
                  value={uPrimaryRole}
                  onChange={(e) => setUPrimaryRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  {roles.map((r) => (
                    <option key={r.slug} value={r.slug}>
                      {r.name_bn}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">প্রতিষ্ঠান</label>
                <select
                  value={uUnitId}
                  onChange={(e) => setUUnitId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  <option value="">গ্লোবাল / উপজেলা</option>
                  {institutions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name_bn}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">ওয়ার্ড নম্বর (কমা দিয়ে, যেমন 4)</label>
                <input
                  type="text"
                  value={uWards}
                  onChange={(e) => setUWards(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">বিভাগ (যেমন licensing)</label>
                <input
                  type="text"
                  value={uDepts}
                  onChange={(e) => setUDepts(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>
            <div>
              <label className="font-bold block mb-1">মোবাইল *</label>
              <input
                type="text"
                required
                value={uMobile}
                onChange={(e) => setUMobile(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCreateUserOpen(false)} className="px-4 py-2 rounded-xl border border-slate-300 font-bold">
                বাতিল
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold">
                একাউন্ট তৈরি করুন
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ASSIGN ROLE & SCOPE MODAL */}
      {assignRoleUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleRequestAssignRole} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
              রোল ও অধিক্ষেত্র বরাদ্দ: {assignRoleUser.name_bn}
            </h3>
            <div>
              <label className="font-bold block mb-1">রোল নির্বাচন করুন *</label>
              <select
                value={arRoleSlug}
                onChange={(e) => setArRoleSlug(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
              >
                {roles.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name_bn} ({r.slug})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold block mb-1">প্রতিষ্ঠান</label>
              <select
                value={arUnitId}
                onChange={(e) => setArUnitId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
              >
                <option value="">গ্লোবাল / উপজেলা</option>
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name_bn}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">ওয়ার্ড (কমা দিয়ে)</label>
                <input
                  type="text"
                  value={arWards}
                  onChange={(e) => setArWards(e.target.value)}
                  placeholder="যেমন: 4, 5"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">বিভাগ</label>
                <input
                  type="text"
                  value={arDepts}
                  onChange={(e) => setArDepts(e.target.value)}
                  placeholder="licensing, revenue"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>
            <div>
              <label className="font-bold block mb-1">মেয়াদ শেষের তারিখ (ঐচ্ছিক)</label>
              <input
                type="date"
                value={arExpiresAt}
                onChange={(e) => setArExpiresAt(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">কারণ / অফিস আদেশ</label>
              <input
                type="text"
                value={arReason}
                onChange={(e) => setArReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAssignRoleUser(null)} className="px-4 py-2 rounded-xl border border-slate-300 font-bold">
                বাতিল
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold">
                পর্যালোচনা ও নিশ্চিত করুন
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TEMPORARY / REVOKE OVERRIDE MODAL */}
      {overrideUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleRequestCreateOverride} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
              পারমিশন ওভাররাইড: {overrideUser.name_bn}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">ধরন</label>
                <select
                  value={ovEffect}
                  onChange={(e) => setOvEffect(e.target.value as 'grant' | 'revoke')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                >
                  <option value="grant">সাময়িক অনুমতি প্রদান (GRANT)</option>
                  <option value="revoke">অনুমতি বাতিল (REVOKE)</option>
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">পরিধি</label>
                <select
                  value={ovScope}
                  onChange={(e) => setOvScope(e.target.value as PermissionScope)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  {SCOPE_OPTIONS.map((sc) => (
                    <option key={sc.value} value={sc.value}>
                      {sc.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="font-bold block mb-1">পারমিশন *</label>
              <select
                value={ovPermKey}
                onChange={(e) => setOvPermKey(e.target.value as PermissionKey)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
              >
                {permissions.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name_bn} ({p.key})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold block mb-1">মেয়াদ শেষের তারিখ (ঐচ্ছিক)</label>
              <input
                type="date"
                value={ovExpiresAt}
                onChange={(e) => setOvExpiresAt(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">কারণ *</label>
              <input
                type="text"
                required
                value={ovReason}
                onChange={(e) => setOvReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOverrideUser(null)} className="px-4 py-2 rounded-xl border border-slate-300 font-bold">
                বাতিল
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold">
                পর্যালোচনা ও নিশ্চিত করুন
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ADMIN PASSWORD RESET MODAL */}
      {resetPwdUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.adminResetUserPassword(token, resetPwdUser.id, resetNewPwd);
                setResetPwdUser(null);
                onSuccess(`${resetPwdUser.name_bn} এর পাসওয়ার্ড সফলভাবে রিসেট ও একাউন্ট আনলক হয়েছে।`);
                await loadAllRbacData();
              } catch (err) {
                onError(err instanceof Error ? err.message : 'পাসওয়ার্ড রিসেট ব্যর্থ।');
              }
            }}
            className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-3"
          >
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
              পাসওয়ার্ড রিসেট: {resetPwdUser.name_bn}
            </h3>
            <div>
              <label className="font-bold block mb-1">নতুন পাসওয়ার্ড (৮+ অক্ষর ও সংখ্যা) *</label>
              <input
                type="password"
                required
                value={resetNewPwd}
                onChange={(e) => setResetNewPwd(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setResetPwdUser(null)} className="px-4 py-2 rounded-xl border border-slate-300 font-bold">
                বাতিল
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold">
                সংরক্ষণ করুন
              </button>
            </div>
          </form>
        </div>
      )}

      {/* GRANT APPROVAL AUTHORITY MODAL */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleRequestGrantAuthority} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
              সেবা-ভিত্তিক সনদ অনুমোদন ক্ষমতা অর্পণ
            </h3>
            <div>
              <label className="font-bold block mb-1">কর্মকর্তা *</label>
              <select
                value={aaUserId}
                onChange={(e) => setAaUserId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name_bn} ({u.primary_role})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">কার্যকর রোল *</label>
                <select
                  value={aaRoleSlug}
                  onChange={(e) => setAaRoleSlug(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  {roles.map((r) => (
                    <option key={r.slug} value={r.slug}>
                      {r.name_bn}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">প্রতিষ্ঠান *</label>
                <select
                  value={aaUnitId}
                  onChange={(e) => setAaUnitId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  {institutions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name_bn}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="font-bold block mb-1">অনুমোদিত সেবা *</label>
              <select
                value={aaServiceId}
                onChange={(e) => setAaServiceId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
              >
                <option value="*">সকল সেবা (*)</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_bn} ({s.id})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">সর্বোচ্চ ফি সীমা (ঐচ্ছিক)</label>
                <input
                  type="number"
                  min={0}
                  value={aaMaxFee}
                  onChange={(e) => setAaMaxFee(e.target.value)}
                  placeholder="খালি = সীমাহীন"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">মেয়াদ শেষ (ঐচ্ছিক)</label>
                <input
                  type="date"
                  value={aaExpiresAt}
                  onChange={(e) => setAaExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>
            <div>
              <label className="font-bold block mb-1">অফিস আদেশ / মন্তব্য *</label>
              <input
                type="text"
                required
                value={aaNote}
                onChange={(e) => setAaNote(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <label className="flex items-center gap-2 font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={aaSelfApproval}
                onChange={(e) => setAaSelfApproval(e.target.checked)}
              />
              <span>নিজ-সৃষ্ট আবেদন অনুমোদনের অনুমতি (সাধারণত নিষিদ্ধ রাখুন)</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAuthModalOpen(false)} className="px-4 py-2 rounded-xl border border-slate-300 font-bold">
                বাতিল
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold">
                পর্যালোচনা ও নিশ্চিত করুন
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MANDATORY PRE-SAVE CONFIRMATION MODAL */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 border-b border-slate-200 pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{pendingConfirm.title}</h3>
                <p className="text-slate-600 mt-0.5">
                  লক্ষ্য: <strong>{pendingConfirm.targetLabel}</strong>
                </p>
                <p className="text-[11px] text-emerald-800 font-semibold">{pendingConfirm.scopeLabel}</p>
              </div>
            </div>

            {pendingConfirm.sensitiveWarnings.length > 0 && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 space-y-1">
                <div className="font-bold text-red-800 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  <span>সংবেদনশীল অধিকার সতর্কতা ({pendingConfirm.sensitiveWarnings.length})</span>
                </div>
                <ul className="list-disc list-inside text-[11px] text-red-700 space-y-0.5">
                  {pendingConfirm.sensitiveWarnings.slice(0, 8).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {pendingConfirm.approvalImpact && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                <strong>সনদ অনুমোদন প্রভাব:</strong> {pendingConfirm.approvalImpact}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
                <div className="font-bold text-emerald-900 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>অনুমোদিত অধিকার ({pendingConfirm.grantedSummary.length})</span>
                </div>
                <ul className="text-[11px] text-emerald-800 space-y-0.5 max-h-32 overflow-y-auto">
                  {pendingConfirm.grantedSummary.slice(0, 12).map((g, i) => (
                    <li key={i}>• {g}</li>
                  ))}
                  {pendingConfirm.grantedSummary.length > 12 && (
                    <li className="font-bold">+ আরও {pendingConfirm.grantedSummary.length - 12}টি...</li>
                  )}
                </ul>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5 text-red-600" />
                  <span>সীমাবদ্ধ / বাতিল ({pendingConfirm.restrictedSummary.length})</span>
                </div>
                {pendingConfirm.restrictedSummary.length === 0 ? (
                  <p className="text-[11px] text-slate-500">নতুন কোনো অধিকার বাতিল হচ্ছে না।</p>
                ) : (
                  <ul className="text-[11px] text-red-700 space-y-0.5 max-h-32 overflow-y-auto">
                    {pendingConfirm.restrictedSummary.map((r, i) => (
                      <li key={i}>• {r}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setPendingConfirm(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700"
              >
                বাতিল করুন
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={executeConfirmedAction}
                className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold"
              >
                {confirmBusy ? 'সংরক্ষণ হচ্ছে...' : 'নিশ্চিত সংরক্ষণ করুন'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SAFE ACCOUNT CLEANUP CONFIRMATION MODAL */}
      {cleanupConfirmOpen && initialResetPreview && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">
              পূর্ববর্তী প্রশাসনিক অ্যাকাউন্ট নিরাপদ নিষ্ক্রিয়করণ নিশ্চিতকরণ
            </h3>
            <p className="text-slate-600 text-xs">
              আপনি মোট <strong>{initialResetPreview.accounts_to_be_deactivated.length}টি</strong> পূর্ববর্তী প্রশাসনিক ও টেস্ট অ্যাকাউন্ট নিষ্ক্রিয় (Deactivate) করতে যাচ্ছেন। এতে তাদের সকল সক্রিয় সেশন ও রিমেম্বার টোকেন বাতিল হবে, তবে <strong>{initialResetPreview.preserved_records_summary.applications_count}টি আবেদন</strong>, <strong>{initialResetPreview.preserved_records_summary.certificates_count}টি সনদ</strong> এবং <strong>{initialResetPreview.preserved_records_summary.citizen_accounts_count}টি নাগরিক অ্যাকাউন্ট</strong> সম্পূর্ণ অক্ষুণ্ণ থাকবে।
            </p>
            <div>
              <label className="block font-bold text-slate-700 mb-1">অডিট লগের কারণ:</label>
              <input
                type="text"
                value={cleanupReasonBn}
                onChange={(e) => setCleanupReasonBn(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCleanupConfirmOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await api.executeInitialAdminReset(token, {
                      confirm_deactivation: true,
                      reason_bn: cleanupReasonBn,
                    });
                    setCleanupConfirmOpen(false);
                    onSuccess(
                      `প্রাক-ক্লিনআপ ব্যাকআপ (${res.backup_id}) সংরক্ষিত হয়েছে এবং ${res.deactivated_count}টি পূর্ববর্তী অ্যাকাউন্ট নিরাপদভাবে নিষ্ক্রিয় করা হয়েছে।`
                    );
                    await loadAllRbacData();
                  } catch (err) {
                    onError(err instanceof Error ? err.message : 'অ্যাকাউন্ট ক্লিনআপ ব্যর্থ হয়েছে।');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold"
              >
                ব্যাকআপসহ নিরাপদ নিষ্ক্রিয়করণ নিশ্চিত করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ONE-TIME INVITATION PASSWORD SETUP MODAL */}
      {setupPwdTarget && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">
              এককালীন আমন্ত্রণ টোকেনের মাধ্যমে পাসওয়ার্ড সেটআপ ({setupPwdTarget.display_name})
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">ইউজারনেম</label>
                <input
                  type="text"
                  value={setupPwdTarget.username}
                  disabled
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">এককালীন আমন্ত্রণ টোকেন (Invitation Token)</label>
                <input
                  type="text"
                  value={setupInvitationToken}
                  onChange={(e) => setSetupInvitationToken(e.target.value)}
                  placeholder="inv_..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  নতুন শক্তিশালী পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর, বড়/ছোট হাতের অক্ষর, সংখ্যা ও বিশেষ চিহ্ন)
                </label>
                <input
                  type="password"
                  value={setupNewPassword}
                  onChange={(e) => setSetupNewPassword(e.target.value)}
                  placeholder="শক্তিশালী পাসওয়ার্ড লিখুন"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSetupPwdTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await api.setupAccountPasswordWithInvitation({
                      username: setupPwdTarget.username,
                      invitation_token: setupInvitationToken,
                      new_password: setupNewPassword,
                    });
                    setSetupPwdTarget(null);
                    onSuccess(res.message_bn);
                    await loadAllRbacData();
                  } catch (err) {
                    onError(err instanceof Error ? err.message : 'পাসওয়ার্ড সেটআপ ব্যর্থ হয়েছে।');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold"
              >
                পাসওয়ার্ড সংরক্ষণ করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OFFICIAL IDENTITY & APPOINTMENT VERIFICATION MODAL */}
      {verifyIdentityTarget && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">
              দাপ্তরিক পরিচয় ও নিয়োগ যাচাই ({verifyIdentityTarget.display_name})
            </h3>
            <p className="text-slate-600 text-xs">
              রোল: <strong>{verifyIdentityTarget.role_label}</strong> • প্রতিষ্ঠান: <strong>{verifyIdentityTarget.institution_name}</strong>
            </p>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                নিয়োগপত্র / গেজেট / পরিচয় যাচাইয়ের দাপ্তরিক সূত্র ও মন্তব্য
              </label>
              <textarea
                rows={3}
                value={verifyIdentityNoteBn}
                onChange={(e) => setVerifyIdentityNoteBn(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVerifyIdentityTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.verifyInitialAdminIdentity(token, verifyIdentityTarget.id, {
                      verification_note_bn: verifyIdentityNoteBn,
                      activate_account: verifyIdentityTarget.has_password_set,
                    });
                    setVerifyIdentityTarget(null);
                    onSuccess(
                      verifyIdentityTarget.has_password_set
                        ? `${verifyIdentityTarget.display_name} এর দাপ্তরিক পরিচয় যাচাই ও অ্যাকাউন্ট লগইনের জন্য সক্রিয় করা হয়েছে।`
                        : `${verifyIdentityTarget.display_name} এর দাপ্তরিক পরিচয় যাচাই নথিভুক্ত হয়েছে। পাসওয়ার্ড সেটআপ সম্পন্ন হলেই অ্যাকাউন্টটি সক্রিয় হবে।`
                    );
                    await loadAllRbacData();
                  } catch (err) {
                    onError(err instanceof Error ? err.message : 'পরিচয় যাচাই ব্যর্থ হয়েছে।');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold"
              >
                পরিচয় যাচাই নিশ্চিত করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
