import React, { useEffect, useRef, useState } from 'react';
import {
  MapPin,
  ChevronDown,
  User,
  Home,
  FileText,
  Search,
  Bell,
  Building2,
  Shield,
  RotateCcw,
  Menu,
  X,
  LogIn,
  LayoutGrid,
  QrCode,
  Phone,
  Briefcase,
  LogOut,
} from 'lucide-react';
import { BangladeshEmblem } from './BangladeshEmblem';
import { AdministrativeUnit, Service, UserRole, UserSession } from '../../types';

interface HeaderProps {
  currentView: string;
  selectedUnitId?: string;
  onNavigate: (view: string, param?: string) => void;
  onSearchServices: (query: string) => void;
  lang: 'bn' | 'en';
  onToggleLang: () => void;
  institutions: AdministrativeUnit[];
  services?: Service[];
  userSession: UserSession;
  onSwitchRole: (role: UserRole, unitId?: string, username?: string) => void;
  onLogout?: () => void;
  onResetData: () => void;
}

type DesktopMenuKey = 'services' | 'union' | 'role' | null;

export const Header: React.FC<HeaderProps> = ({
  currentView,
  selectedUnitId,
  onNavigate,
  onSearchServices,
  lang,
  onToggleLang,
  institutions,
  services = [],
  userSession,
  onSwitchRole,
  onLogout,
  onResetData,
}) => {
  const [openDesktopMenu, setOpenDesktopMenu] = useState<DesktopMenuKey>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileServicesExpanded, setMobileServicesExpanded] = useState(false);
  const [mobileUnionsExpanded, setMobileUnionsExpanded] = useState(false);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  const headerRootRef = useRef<HTMLElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const servicesMenuRef = useRef<HTMLDivElement>(null);
  const unionMenuRef = useRef<HTMLDivElement>(null);
  const roleMenuRef = useRef<HTMLDivElement>(null);

  const unions = institutions.filter((i) => i.type === 'union_parishad');
  const muni = institutions.find((i) => i.type === 'municipality');
  const muniId = muni?.id || 'unit_pabna_muni';

  const countByCat = (cat: string, fallback: number) =>
    services.length > 0 ? services.filter((s) => s.category === cat).length : fallback;
  const totalServicesCount = services.length > 0 ? services.length : 47;

  const toBnNum = (n: number) => n.toLocaleString('bn-BD');

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openMenu = (key: Exclude<DesktopMenuKey, null>) => {
    clearCloseTimer();
    setOpenDesktopMenu(key);
  };

  const scheduleCloseMenu = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpenDesktopMenu(null);
    }, 160);
  };

  const closeAllMenus = () => {
    clearCloseTimer();
    setOpenDesktopMenu(null);
    setLocationMenuOpen(false);
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    const handlePointerOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (headerRootRef.current && target && !headerRootRef.current.contains(target)) {
        closeAllMenus();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAllMenus();
      }
    };
    document.addEventListener('mousedown', handlePointerOutside);
    document.addEventListener('touchstart', handlePointerOutside, { passive: true });
    document.addEventListener('keydown', handleEscape);
    return () => {
      clearCloseTimer();
      document.removeEventListener('mousedown', handlePointerOutside);
      document.removeEventListener('touchstart', handlePointerOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const focusMenuItem = (container: HTMLDivElement | null, direction: 'first' | 'last' | 'next' | 'prev') => {
    if (!container) return;
    const items = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    );
    if (items.length === 0) return;
    const activeIdx = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIdx = 0;
    if (direction === 'first') nextIdx = 0;
    else if (direction === 'last') nextIdx = items.length - 1;
    else if (direction === 'next') nextIdx = activeIdx >= 0 ? (activeIdx + 1) % items.length : 0;
    else if (direction === 'prev') nextIdx = activeIdx > 0 ? activeIdx - 1 : items.length - 1;
    items[nextIdx]?.focus();
  };

  const handleMenuTriggerKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    key: Exclude<DesktopMenuKey, null>,
    menuContainer: HTMLDivElement | null
  ) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openMenu(key);
      requestAnimationFrame(() => focusMenuItem(menuContainer, 'first'));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu(key);
      requestAnimationFrame(() => focusMenuItem(menuContainer, 'last'));
    } else if (e.key === 'Escape') {
      closeAllMenus();
    }
  };

  const handleMenuPanelKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    triggerSelector?: string
  ) => {
    const container = e.currentTarget;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusMenuItem(container, 'next');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusMenuItem(container, 'prev');
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusMenuItem(container, 'first');
    } else if (e.key === 'End') {
      e.preventDefault();
      focusMenuItem(container, 'last');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpenDesktopMenu(null);
      if (triggerSelector) {
        headerRootRef.current?.querySelector<HTMLButtonElement>(triggerSelector)?.focus();
      }
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchServices(searchInput);
  };

  const getRoleDisplayName = (session: UserSession) => {
    if (session.role === 'citizen') return lang === 'bn' ? 'নাগরিক' : 'Citizen';
    if (session.role === 'supervisor') return 'Supervisor (সুপারভাইজার)';
    if (session.role === 'developer') return 'Developer (ডেভেলপার)';
    if (session.role === 'chairman') return 'UP Chairman (চেয়ারম্যান)';
    if (session.role === 'secretary') return 'UP Secretary (সচিব)';
    return session.title_bn || 'প্রশাসনিক কর্মকর্তা';
  };

  const isServicesOpen = openDesktopMenu === 'services';
  const isUnionOpen = openDesktopMenu === 'union';
  const isRoleOpen = openDesktopMenu === 'role';

  const isMunicipalityActive =
    currentView === 'institution_detail' && selectedUnitId === muniId;
  const isUnionSectionActive =
    isUnionOpen ||
    currentView === 'union_directory' ||
    (currentView === 'institution_detail' && selectedUnitId !== muniId);

  return (
    <header ref={headerRootRef} className="no-print sticky top-0 z-50 bg-white border-b border-slate-200 select-none">
      {/* Top Dark Green Utility Bar (#064E32) */}
      <div className="bg-[#064E32] text-white text-[11px] sm:text-xs px-3 sm:px-6 py-1.5 border-b border-[#053D27]">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          {/* Left: System Title + Compact Role Switcher */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="font-semibold text-emerald-50 whitespace-nowrap truncate">
              {lang === 'bn' ? 'অনলাইন সার্টিফিকেট সিস্টেম' : 'Online Certificate System'}
            </span>

            {/* Preserved Role Switcher with continuous hover zone */}
            <div
              className="relative inline-block"
              onMouseEnter={() => openMenu('role')}
              onMouseLeave={scheduleCloseMenu}
            >
              <button
                type="button"
                id="header-role-trigger"
                aria-haspopup="menu"
                aria-expanded={isRoleOpen}
                onClick={() => setOpenDesktopMenu(isRoleOpen ? null : 'role')}
                onKeyDown={(e) => handleMenuTriggerKeyDown(e, 'role', roleMenuRef.current)}
                className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-emerald-100 px-2 py-0.5 rounded text-[11px] transition-colors whitespace-nowrap"
                title="রোল পরিবর্তন করুন"
              >
                <Shield className="w-3 h-3 text-emerald-300" />
                <span>{getRoleDisplayName(userSession)}</span>
                <ChevronDown className={`w-3 h-3 opacity-80 transition-transform ${isRoleOpen ? 'rotate-180' : ''}`} />
              </button>

              {isRoleOpen && (
                <div className="absolute left-0 top-full pt-1 z-50">
                  <div
                    ref={roleMenuRef}
                    role="menu"
                    aria-labelledby="header-role-trigger"
                    onKeyDown={(e) => handleMenuPanelKeyDown(e, '#header-role-trigger')}
                    className="w-72 max-h-[75vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1.5 text-slate-200"
                  >
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-800 flex items-center justify-between">
                      <span>৪টি প্রশাসনিক রোল ও নাগরিক একাউন্ট</span>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onResetData();
                          setOpenDesktopMenu(null);
                        }}
                        className="text-amber-300 hover:underline flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>রিসেট</span>
                      </button>
                    </div>

                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-slate-950/60">
                      পাবলিক অ্যাকাউন্ট (CITIZEN)
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onSwitchRole('citizen', undefined, 'citizen');
                        setOpenDesktopMenu(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-emerald-800/50 focus:bg-emerald-800/60 focus:outline-hidden flex items-center justify-between ${
                        userSession.role === 'citizen' ? 'text-emerald-400 font-bold bg-slate-800' : ''
                      }`}
                    >
                      <span>সাধারণ নাগরিক (Citizen)</span>
                      {userSession.role === 'citizen' && <span>সক্রিয়</span>}
                    </button>

                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-slate-950/60 border-t border-slate-800">
                      ইউনিয়ন পরিষদ (UP_CHAIRMAN & UP_SECRETARY)
                    </div>
                    {[
                      {
                        role: 'chairman' as UserRole,
                        unit: 'unit_goyeshpur',
                        label: '১. UP Chairman — গোয়েশপুর ইউপি চেয়ারম্যান',
                        active: userSession.role === 'chairman' && userSession.administrative_unit_id === 'unit_goyeshpur',
                      },
                      {
                        role: 'secretary' as UserRole,
                        unit: 'unit_goyeshpur',
                        label: '২. UP Secretary — গোয়েশপুর ইউপি সচিব',
                        active: userSession.role === 'secretary' && userSession.administrative_unit_id === 'unit_goyeshpur',
                      },
                      {
                        role: 'chairman' as UserRole,
                        unit: 'unit_maligachha',
                        label: 'অন্য ইউপি: মালিগাছা ইউপি চেয়ারম্যান',
                        active: userSession.role === 'chairman' && userSession.administrative_unit_id === 'unit_maligachha',
                      },
                      {
                        role: 'secretary' as UserRole,
                        unit: 'unit_maligachha',
                        label: 'অন্য ইউপি: মালিগাছা ইউপি সচিব',
                        active: userSession.role === 'secretary' && userSession.administrative_unit_id === 'unit_maligachha',
                      },
                      {
                        role: 'chairman' as UserRole,
                        unit: 'unit_bharara',
                        label: 'অন্য ইউপি: ভাঁড়ারা ইউপি চেয়ারম্যান',
                        active: userSession.role === 'chairman' && userSession.administrative_unit_id === 'unit_bharara',
                      },
                    ].map((item) => (
                      <button
                        type="button"
                        role="menuitem"
                        key={`${item.role}_${item.unit}`}
                        onClick={() => {
                          onSwitchRole(item.role, item.unit);
                          setOpenDesktopMenu(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-emerald-800/50 focus:bg-emerald-800/60 focus:outline-hidden flex items-center justify-between ${
                          item.active ? 'text-emerald-400 font-bold bg-slate-800' : ''
                        }`}
                      >
                        <span>{item.label}</span>
                        {item.active && <span>সক্রিয়</span>}
                      </button>
                    ))}

                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-teal-400 bg-slate-950/60 border-t border-slate-800">
                      পাবনা পৌরসভা (স্বতন্ত্র প্রতিষ্ঠান)
                    </div>
                    {[
                      {
                        role: 'chairman' as UserRole,
                        unit: 'unit_pabna_muni',
                        label: 'পৌর অনুমোদনকারী (UP Chairman সমমান)',
                        active: userSession.role === 'chairman' && userSession.administrative_unit_id === 'unit_pabna_muni',
                      },
                      {
                        role: 'secretary' as UserRole,
                        unit: 'unit_pabna_muni',
                        label: 'পৌর সচিব (UP Secretary সমমান)',
                        active: userSession.role === 'secretary' && userSession.administrative_unit_id === 'unit_pabna_muni',
                      },
                    ].map((item) => (
                      <button
                        type="button"
                        role="menuitem"
                        key={`${item.role}_${item.unit}`}
                        onClick={() => {
                          onSwitchRole(item.role, item.unit);
                          setOpenDesktopMenu(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-emerald-800/50 focus:bg-emerald-800/60 focus:outline-hidden flex items-center justify-between ${
                          item.active ? 'text-emerald-400 font-bold bg-slate-800' : ''
                        }`}
                      >
                        <span>{item.label}</span>
                        {item.active && <span>সক্রিয়</span>}
                      </button>
                    ))}

                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-slate-950/60 border-t border-slate-800">
                      গ্লোবাল প্ল্যাটফর্ম প্রশাসন
                    </div>
                    {[
                      { role: 'developer' as UserRole, label: '৩. DEVELOPER (ডেভেলপার / টেকনিক্যাল)' },
                      { role: 'supervisor' as UserRole, label: '৪. SUPERVISOR (সুপারভাইজার / মালিক)' },
                    ].map((item) => (
                      <button
                        type="button"
                        role="menuitem"
                        key={item.role}
                        onClick={() => {
                          onSwitchRole(item.role);
                          setOpenDesktopMenu(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-emerald-800/50 focus:bg-emerald-800/60 focus:outline-hidden flex items-center justify-between ${
                          userSession.role === item.role ? 'text-emerald-400 font-bold bg-slate-800' : ''
                        }`}
                      >
                        <span>{item.label}</span>
                        {userSession.role === item.role && <span>সক্রিয়</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Account shortcuts, Language Toggle & Red Login Button */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('citizen_dashboard')}
              className="hidden sm:flex items-center gap-1 text-emerald-100 hover:text-white transition-colors whitespace-nowrap"
            >
              <User className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'নাগরিক ড্যাশবোর্ড' : 'Citizen Portal'}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('admin_login', 'administrative')}
              className="hidden md:flex items-center gap-1 text-emerald-100 hover:text-white transition-colors whitespace-nowrap"
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'প্রশাসনিক একাউন্ট' : 'Admin Account'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleLang}
              className="bg-white/10 hover:bg-white/20 text-white px-2 py-0.5 rounded font-semibold transition-colors whitespace-nowrap"
            >
              {lang === 'bn' ? 'EN' : 'বাংলা'}
            </button>

            {userSession.role === 'citizen' && !userSession.token ? (
              <button
                type="button"
                onClick={() => onNavigate('admin_login', 'citizen')}
                className="flex items-center gap-1.5 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-600 text-white px-4 py-1.5 rounded-xl font-bold shadow-md hover:shadow-xl transition-all transform hover:-translate-y-0.5 whitespace-nowrap text-xs border border-amber-400/40"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{lang === 'bn' ? 'লগইন' : 'Login'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                {userSession.role !== 'citizen' && (
                  <button
                    type="button"
                    onClick={() => onNavigate('admin_dashboard')}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-600 text-white px-4 py-1.5 rounded-xl font-bold shadow-md hover:shadow-xl transition-all transform hover:-translate-y-0.5 border border-blue-400/40 whitespace-nowrap text-xs"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard'}</span>
                  </button>
                )}
                {onLogout && userSession.token && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex items-center gap-1 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-red-600 hover:to-rose-700 text-white px-3 py-1.5 rounded-xl font-bold shadow-sm hover:shadow-md transition-all transform hover:-translate-y-0.5 whitespace-nowrap text-xs"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>{lang === 'bn' ? 'লগআউট' : 'Logout'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main White Brand + Location + Search Header */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => {
            closeAllMenus();
            onNavigate('home');
          }}
          className="flex items-center gap-2.5 sm:gap-3 cursor-pointer shrink-0 group text-left"
        >
          <BangladeshEmblem size={42} />
          <div>
            <div className="text-xl sm:text-2xl font-black tracking-tight leading-none">
              <span className="text-[#064E32] group-hover:text-[#08783F] transition-colors">Pottoyon</span>
              <span className="text-[#DC2626]">BD</span>
            </div>
            <p className="text-[11px] sm:text-xs font-semibold text-slate-600 leading-tight mt-0.5">
              {lang === 'bn' ? 'স্থানীয় সরকার ডিজিটাল সেবা' : 'Digital Local Government Services'}
            </p>
          </div>
        </button>

        {/* Desktop Center Location Marker */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-[#F3F6F4] px-3.5 py-2 rounded-lg border border-slate-200/80 whitespace-nowrap">
          <MapPin className="w-4 h-4 text-[#08783F] shrink-0" />
          <span>{lang === 'bn' ? 'পাবনা সদর উপজেলা, পাবনা' : 'Pabna Sadar Upazila, Pabna'}</span>
        </div>

        {/* Desktop Right Search Bar & Notification Bell */}
        <div className="hidden lg:flex items-center gap-3 flex-1 max-w-md justify-end">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 flex items-center">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={lang === 'bn' ? 'সেবা, ফরম বা তথ্য খুঁজুন...' : 'Search services, forms or info...'}
              className="w-full pl-4 pr-12 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#08783F]"
            />
            <button
              type="submit"
              aria-label="Search"
              className="absolute right-1 top-1 bottom-1 px-3 rounded-md bg-[#08783F] hover:bg-[#064E32] text-white transition-colors flex items-center justify-center"
            >
              <Search className="w-4 h-4" />
            </button>
          </form>

          <button
            type="button"
            onClick={() => onNavigate('notices')}
            aria-label="Notifications"
            className="relative p-2 rounded-lg border border-slate-200 bg-[#F3F6F4] hover:bg-emerald-50 text-slate-700 hover:text-[#08783F] transition-colors"
            title={lang === 'bn' ? 'নোটিশ ও বিজ্ঞপ্তি' : 'Notices'}
          >
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#DC2626] border-2 border-white"></span>
          </button>
        </div>

        {/* Mobile Right Controls: Bell + Hamburger */}
        <div className="flex items-center gap-1.5 lg:hidden shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('notices')}
            aria-label="Notifications"
            className="relative p-2.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#DC2626]"></span>
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="p-2.5 rounded-lg text-slate-800 hover:bg-slate-100 transition-colors"
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Location & Search Strip */}
      <div className="lg:hidden bg-white border-t border-slate-100 px-3 pb-2.5 pt-1.5 space-y-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setLocationMenuOpen((o) => !o)}
            aria-expanded={locationMenuOpen}
            className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 py-1 px-1"
          >
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#08783F]" />
              <span>{lang === 'bn' ? 'পাবনা সদর উপজেলা, পাবনা' : 'Pabna Sadar Upazila, Pabna'}</span>
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${locationMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {locationMenuOpen && (
            <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-40 py-1.5 max-h-60 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  onNavigate('institution_detail', muniId);
                  setLocationMenuOpen(false);
                }}
                className="w-full text-left px-3.5 py-2 text-xs font-bold text-[#08783F] hover:bg-emerald-50 border-b border-slate-100 flex items-center justify-between"
              >
                <span>পাবনা পৌরসভা (স্বতন্ত্র)</span>
                <span className="text-[10px] text-slate-500">১৫টি ওয়ার্ড</span>
              </button>
              {unions.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => {
                    onNavigate('institution_detail', u.id);
                    setLocationMenuOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-emerald-50 flex items-center justify-between"
                >
                  <span>{u.name_bn}</span>
                  <span className="text-[10px] text-slate-400">৯টি ওয়ার্ড</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleSearchSubmit} className="relative flex items-center">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={lang === 'bn' ? 'সেবা, ফরম বা তথ্য খুঁজুন...' : 'Search services, forms...'}
            className="w-full pl-3.5 pr-11 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#08783F]"
          />
          <button
            type="submit"
            aria-label="Search"
            className="absolute right-0.5 top-0.5 bottom-0.5 px-3 rounded-md bg-[#064E32] hover:bg-[#08783F] text-white transition-colors flex items-center justify-center"
          >
            <Search className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Desktop Navigation Row */}
      <nav aria-label="Main Navigation" className="hidden lg:block bg-white border-t border-slate-200/80">
        <div className="max-w-7xl mx-auto px-6 py-1.5 flex items-center justify-between text-sm font-semibold text-slate-700">
          <div className="flex items-center gap-2">
            {/* Home Button */}
            <button
              type="button"
              onClick={() => {
                closeAllMenus();
                onNavigate('home');
              }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                currentView === 'home'
                  ? 'bg-[#08783F] text-white font-bold shadow-xs'
                  : 'text-slate-700 hover:text-[#08783F] hover:bg-[#F3F6F4]'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>{lang === 'bn' ? 'প্রথম পাতা' : 'Home'}</span>
            </button>

            {/* Services Dropdown (Zero hover-gap continuous container + 160ms grace + ARIA + keyboard) */}
            <div
              className="relative"
              onMouseEnter={() => openMenu('services')}
              onMouseLeave={scheduleCloseMenu}
            >
              <button
                type="button"
                id="header-services-trigger"
                aria-haspopup="menu"
                aria-expanded={isServicesOpen}
                onClick={() => setOpenDesktopMenu(isServicesOpen ? null : 'services')}
                onKeyDown={(e) => handleMenuTriggerKeyDown(e, 'services', servicesMenuRef.current)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  isServicesOpen || currentView === 'services'
                    ? 'bg-[#08783F] text-white font-bold'
                    : 'text-slate-700 hover:text-[#08783F] hover:bg-[#F3F6F4]'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span>{lang === 'bn' ? 'সেবাসমূহ' : 'Services'}</span>
                <ChevronDown className={`w-3.5 h-3.5 opacity-80 transition-transform ${isServicesOpen ? 'rotate-180' : ''}`} />
              </button>

              {isServicesOpen && (
                <div className="absolute left-0 top-full pt-1 z-50">
                  <div
                    ref={servicesMenuRef}
                    role="menu"
                    aria-labelledby="header-services-trigger"
                    onKeyDown={(e) => handleMenuPanelKeyDown(e, '#header-services-trigger')}
                    className="w-72 bg-white border border-slate-200 rounded-xl shadow-xl py-2 text-xs"
                  >
                    {[
                      {
                        cat: 'citizen_personal',
                        label: `নাগরিক ও ব্যক্তিগত সনদ (${toBnNum(countByCat('citizen_personal', 18))}টি)`,
                      },
                      {
                        cat: 'financial_social',
                        label: `আর্থিক ও সামাজিক সনদ (${toBnNum(countByCat('financial_social', 13))}টি)`,
                      },
                      {
                        cat: 'nid_voter',
                        label: `জাতীয় পরিচয় ও ভোটার (${toBnNum(countByCat('nid_voter', 5))}টি)`,
                      },
                      {
                        cat: 'licensing',
                        label: `ট্রেড ও অন্যান্য লাইসেন্স (${toBnNum(countByCat('licensing', 3))}টি)`,
                      },
                      {
                        cat: 'other',
                        label: `অন্যান্য প্রত্যয়ন সেবা (${toBnNum(countByCat('other', 8))}টি)`,
                      },
                    ].map((item) => (
                      <button
                        key={item.cat}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onNavigate('services', item.cat);
                          setOpenDesktopMenu(null);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-emerald-50 hover:text-[#064E32] focus:bg-emerald-50 focus:text-[#064E32] focus:outline-hidden font-semibold text-slate-800 transition-colors"
                      >
                        {item.label}
                      </button>
                    ))}
                    <div className="border-t border-slate-100 mt-1 pt-1">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onNavigate('services', 'all');
                          setOpenDesktopMenu(null);
                        }}
                        className="w-full text-left px-4 py-2 text-[#08783F] font-bold hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-hidden"
                      >
                        সকল {toBnNum(totalServicesCount)}টি সেবা দেখুন →
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Union Parishad Dropdown (Zero hover-gap continuous container + 160ms grace + ARIA + keyboard) */}
            <div
              className="relative"
              onMouseEnter={() => openMenu('union')}
              onMouseLeave={scheduleCloseMenu}
            >
              <button
                type="button"
                id="header-union-trigger"
                aria-haspopup="menu"
                aria-expanded={isUnionOpen}
                onClick={() => setOpenDesktopMenu(isUnionOpen ? null : 'union')}
                onKeyDown={(e) => handleMenuTriggerKeyDown(e, 'union', unionMenuRef.current)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  isUnionSectionActive
                    ? 'bg-[#08783F] text-white font-bold'
                    : 'text-slate-700 hover:text-[#08783F] hover:bg-[#F3F6F4]'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>{lang === 'bn' ? 'ইউনিয়ন পরিষদ' : 'Union Parishad'}</span>
                <ChevronDown className={`w-3.5 h-3.5 opacity-80 transition-transform ${isUnionOpen ? 'rotate-180' : ''}`} />
              </button>

              {isUnionOpen && (
                <div className="absolute left-0 top-full pt-1 z-50">
                  <div
                    ref={unionMenuRef}
                    role="menu"
                    aria-labelledby="header-union-trigger"
                    onKeyDown={(e) => handleMenuPanelKeyDown(e, '#header-union-trigger')}
                    className="w-72 bg-white border border-slate-200 rounded-xl shadow-xl py-2 divide-y divide-slate-100"
                  >
                    <div className="px-3.5 py-1.5 text-xs font-bold text-slate-500 bg-[#F3F6F4]">
                      {lang === 'bn' ? 'পাবনা সদর উপজেলার ১০টি ইউনিয়ন' : '10 Unions of Pabna Sadar'}
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {unions.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onNavigate('institution_detail', u.id);
                            setOpenDesktopMenu(null);
                          }}
                          className="w-full text-left px-3.5 py-2 text-xs hover:bg-emerald-50 hover:text-[#08783F] focus:bg-emerald-50 focus:outline-hidden flex items-center justify-between transition-colors"
                        >
                          <span className="font-semibold text-slate-800">{u.name_bn}</span>
                          <span className="text-[11px] text-slate-400">৯টি ওয়ার্ড</span>
                        </button>
                      ))}
                    </div>
                    <div className="p-2 bg-[#F3F6F4] text-center">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onNavigate('union_directory');
                          setOpenDesktopMenu(null);
                        }}
                        className="text-xs text-[#08783F] hover:underline font-bold focus:outline-hidden focus:underline"
                      >
                        {lang === 'bn' ? 'সব ইউনিয়নের বিবরণী দেখুন →' : 'View All Unions →'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Municipality */}
            <button
              type="button"
              onClick={() => {
                closeAllMenus();
                onNavigate('institution_detail', muniId);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                isMunicipalityActive
                  ? 'bg-[#08783F] text-white font-bold'
                  : 'text-slate-700 hover:text-[#08783F] hover:bg-[#F3F6F4]'
              }`}
            >
              <span>{lang === 'bn' ? 'পৌরসভা' : 'Municipality'}</span>
            </button>

            {/* Application Tracking */}
            <button
              type="button"
              onClick={() => {
                closeAllMenus();
                onNavigate('tracking');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                currentView === 'tracking'
                  ? 'bg-[#08783F] text-white font-bold'
                  : 'text-slate-700 hover:text-[#08783F] hover:bg-[#F3F6F4]'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>{lang === 'bn' ? 'আবেদনের অবস্থা' : 'Application Tracking'}</span>
            </button>

            {/* Certificate Verification */}
            <button
              type="button"
              onClick={() => {
                closeAllMenus();
                onNavigate('verify');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                currentView === 'verify'
                  ? 'bg-[#08783F] text-white font-bold'
                  : 'text-slate-700 hover:text-[#08783F] hover:bg-[#F3F6F4]'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>{lang === 'bn' ? 'সনদ যাচাইকরণ' : 'Verify Certificate'}</span>
            </button>

            {/* Contact */}
            <button
              type="button"
              onClick={() => {
                closeAllMenus();
                onNavigate('contact');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                currentView === 'contact'
                  ? 'bg-[#08783F] text-white font-bold'
                  : 'text-slate-700 hover:text-[#08783F] hover:bg-[#F3F6F4]'
              }`}
            >
              <Phone className="w-4 h-4" />
              <span>{lang === 'bn' ? 'যোগাযোগ' : 'Contact'}</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer with Expandable Accordions */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-t border-slate-200 px-4 py-4 space-y-3 shadow-lg max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                onNavigate('home');
                setMobileMenuOpen(false);
              }}
              className="p-3 rounded-xl bg-[#F3F6F4] text-left hover:bg-emerald-50 text-slate-800"
            >
              প্রথম পাতা
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('institution_detail', muniId);
                setMobileMenuOpen(false);
              }}
              className="p-3 rounded-xl bg-[#F3F6F4] text-left hover:bg-emerald-50 text-slate-800"
            >
              পাবনা পৌরসভা
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('tracking');
                setMobileMenuOpen(false);
              }}
              className="p-3 rounded-xl bg-[#F3F6F4] text-left hover:bg-emerald-50 text-slate-800"
            >
              আবেদনের অবস্থা
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('verify');
                setMobileMenuOpen(false);
              }}
              className="p-3 rounded-xl bg-[#F3F6F4] text-left hover:bg-emerald-50 text-slate-800"
            >
              সনদ যাচাই (QR)
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('notices');
                setMobileMenuOpen(false);
              }}
              className="p-3 rounded-xl bg-[#F3F6F4] text-left hover:bg-emerald-50 text-slate-800"
            >
              নোটিশ বোর্ড
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('contact');
                setMobileMenuOpen(false);
              }}
              className="p-3 rounded-xl bg-[#F3F6F4] text-left hover:bg-emerald-50 text-slate-800"
            >
              যোগাযোগ
            </button>
          </div>

          {/* Mobile Accordion: Services Submenu */}
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <button
              type="button"
              aria-expanded={mobileServicesExpanded}
              onClick={() => setMobileServicesExpanded((o) => !o)}
              className="w-full px-3.5 py-2.5 bg-[#F3F6F4] font-bold text-slate-800 flex items-center justify-between"
            >
              <span>সেবাসমূহ ({toBnNum(totalServicesCount)}টি)</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${mobileServicesExpanded ? 'rotate-180' : ''}`} />
            </button>
            {mobileServicesExpanded && (
              <div className="divide-y divide-slate-100 bg-white">
                {[
                  { cat: 'all', label: `সকল ${toBnNum(totalServicesCount)}টি সেবা` },
                  { cat: 'citizen_personal', label: `নাগরিক ও ব্যক্তিগত (${toBnNum(countByCat('citizen_personal', 18))}টি)` },
                  { cat: 'financial_social', label: `আর্থিক ও সামাজিক (${toBnNum(countByCat('financial_social', 13))}টি)` },
                  { cat: 'nid_voter', label: `জাতীয় পরিচয় ও ভোটার (${toBnNum(countByCat('nid_voter', 5))}টি)` },
                  { cat: 'licensing', label: `ট্রেড ও লাইসেন্স (${toBnNum(countByCat('licensing', 3))}টি)` },
                  { cat: 'other', label: `অন্যান্য প্রত্যয়ন (${toBnNum(countByCat('other', 8))}টি)` },
                ].map((c) => (
                  <button
                    key={c.cat}
                    type="button"
                    onClick={() => {
                      onNavigate('services', c.cat);
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 font-medium text-slate-700 hover:bg-emerald-50"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mobile Accordion: 10 Union Parishads */}
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <button
              type="button"
              aria-expanded={mobileUnionsExpanded}
              onClick={() => setMobileUnionsExpanded((o) => !o)}
              className="w-full px-3.5 py-2.5 bg-[#F3F6F4] font-bold text-slate-800 flex items-center justify-between"
            >
              <span>১০টি ইউনিয়ন পরিষদ</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${mobileUnionsExpanded ? 'rotate-180' : ''}`} />
            </button>
            {mobileUnionsExpanded && (
              <div className="divide-y divide-slate-100 bg-white">
                {unions.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      onNavigate('institution_detail', u.id);
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 font-medium text-slate-700 hover:bg-emerald-50 flex justify-between"
                  >
                    <span>{u.name_bn}</span>
                    <span className="text-[10px] text-slate-400">৯টি ওয়ার্ড</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('union_directory');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 font-bold text-[#08783F] hover:bg-emerald-50"
                >
                  সব ইউনিয়নের বিবরণী দেখুন →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
