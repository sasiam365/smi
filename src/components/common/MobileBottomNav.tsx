import React from 'react';
import { Home, LayoutGrid, FilePlus2, QrCode, User } from 'lucide-react';
import { UserSession } from '../../types';

interface MobileBottomNavProps {
  currentView: string;
  onNavigate: (view: string) => void;
  userSession: UserSession;
  lang: 'bn' | 'en';
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentView,
  onNavigate,
  userSession,
  lang,
}) => {
  const navItems = [
    {
      id: 'home',
      label_bn: 'হোম',
      label_en: 'Home',
      icon: Home,
      isActive: currentView === 'home',
      action: () => onNavigate('home'),
    },
    {
      id: 'services',
      label_bn: 'সেবা',
      label_en: 'Services',
      icon: LayoutGrid,
      isActive: currentView === 'services',
      action: () => onNavigate('services'),
    },
    {
      id: 'apply',
      label_bn: 'আবেদন',
      label_en: 'Apply',
      icon: FilePlus2,
      isActive: currentView === 'apply' || currentView === 'tracking',
      action: () => onNavigate('apply'),
    },
    {
      id: 'verify',
      label_bn: 'যাচাই',
      label_en: 'Verify',
      icon: QrCode,
      isActive: currentView === 'verify',
      action: () => onNavigate('verify'),
    },
    {
      id: 'portal',
      label_bn: userSession.role === 'citizen' ? 'নাগরিক' : 'ড্যাশবোর্ড',
      label_en: userSession.role === 'citizen' ? 'Portal' : 'Admin',
      icon: User,
      isActive:
        currentView === 'citizen_dashboard' ||
        currentView === 'admin_login' ||
        currentView === 'admin_dashboard',
      action: () =>
        onNavigate(userSession.role === 'citizen' ? 'citizen_dashboard' : 'admin_dashboard'),
    },
  ];

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="no-print lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
    >
      <div className="grid grid-cols-5 h-16 max-w-md mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.action}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors ${
                item.isActive
                  ? 'text-[#08783F] font-bold'
                  : 'text-slate-500 hover:text-[#08783F] font-medium'
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-colors ${
                  item.isActive ? 'bg-emerald-50 text-[#08783F]' : ''
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] leading-none whitespace-nowrap">
                {lang === 'bn' ? item.label_bn : item.label_en}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
