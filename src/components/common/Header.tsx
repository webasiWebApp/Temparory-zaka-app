/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Global Navigation & Role Header
 * Modern iPhone Apple-like Glass Aesthetic:
 * ◉ ZAKA                         ◯  ◯  ◯
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { firestoreService } from '../../firebase/firestoreService';
import { NotificationRecord, UserRole } from '../../types';
import { NotificationCenterModal } from './NotificationCenterModal';
import { isRiderTarget } from '../../config/appTarget';
import { notificationService } from '../../services/notificationService';
import {
  Bell,
  User,
  Shield,
  LogOut,
  CheckCircle2,
  X,
  Clock,
  MapPin,
  ExternalLink,
  ChevronDown,
  ShieldAlert,
} from 'lucide-react';

interface HeaderProps {
  onOpenAuth?: (initialMode?: 'signin' | 'signup', initialRole?: UserRole) => void;
  onOpenHistory?: () => void;
  onOpenProfile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenAuth,
  onOpenHistory,
  onOpenProfile,
}) => {
  const {
    currentUser,
    userProfile,
    activeRole,
    isAdmin,
    setActiveRole,
    signOut,
  } = useAuth();

  const isAuthenticated = Boolean(currentUser || userProfile);

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showNotificationCenterModal, setShowNotificationCenterModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    if (userProfile?.uid) {
      const uid = userProfile.uid;
      const unsubscribe = firestoreService.listenToUserNotifications(uid, (notes) => {
        setNotifications(notes);
        notificationService.announceNewNotifications(uid, notes);
      });

      // Permission prompts must come from a user gesture: ask on the first interaction after sign-in
      const askOnce = () => {
        notificationService.enableBrowserNotifications().catch(() => {});
      };
      window.addEventListener('pointerdown', askOnce, { once: true });

      return () => {
        unsubscribe();
        window.removeEventListener('pointerdown', askOnce);
      };
    } else {
      setNotifications([]);
    }
  }, [userProfile?.uid]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAsRead = async (id: string) => {
    await firestoreService.markNotificationRead(id);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setShowUserMenu(false);
    } catch (err: any) {
      console.error('Sign out error:', err);
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full max-w-full bg-white/85 backdrop-blur-xl border-b border-black/[0.04] transition-all">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-8 h-15 sm:h-16 gap-4">
        {/* Left: ZAKA Orange Wordmark */}
        <div
          onClick={() => {
            if (activeRole === 'driver' || userProfile?.role === 'driver' || userProfile?.activeRole === 'driver') {
              setActiveRole('driver');
            } else if (!isAdmin) {
              setActiveRole('passenger');
            }
          }}
          className="flex items-center gap-2.5 cursor-pointer select-none shrink-0 group transition-transform active:scale-[0.98]"
        >
          {/* Micro Stylized Icon Badge */}
          <div className="flex h-8 w-8 sm:h-8.5 sm:w-8.5 items-center justify-center rounded-xl bg-gradient-to-tr from-[#FF7A00] to-[#FFA000] text-white shadow-[0_2px_10px_rgba(255,122,0,0.35)] font-black text-sm sm:text-base transition-transform group-hover:scale-105">
            Z
          </div>
          {/* Prominent ZAKA Orange Wordmark */}
          <span className="text-xl sm:text-2xl font-black tracking-tight text-[#FF7A00] leading-none transition-colors group-hover:text-[#e06b00]">
            ZAKA
          </span>
        </div>

        {/* Right: Minimal Actions & Stylized Profile Button */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {/* Rider iOS Target: Direct Notifications Bell Button */}
          {isRiderTarget && (
            <button
              id="btn-header-notifications"
              type="button"
              onClick={() => setShowNotificationCenterModal(true)}
              aria-label="Notifications"
              title="Notifications"
              className="relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full border border-black/[0.06] bg-white/90 text-[#111111] shadow-2xs hover:bg-[#F7F7F5] active:scale-95 transition-all cursor-pointer"
            >
              <Bell className="h-4 w-4 stroke-[2.2] text-[#111111]" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-2 w-2 rounded-full bg-[#FF7A00] ring-2 ring-white" />
              )}
            </button>
          )}

          {/* Authorized Admin Direct Fleet Console Access */}
          {!isRiderTarget && isAdmin && (
            <button
              id="btn-header-admin-console"
              type="button"
              onClick={() => {
                setActiveRole(activeRole === 'admin' ? (userProfile?.role === 'driver' ? 'driver' : 'passenger') : 'admin');
              }}
              aria-label="Admin Fleet Operations"
              title={activeRole === 'admin' ? 'Exit Fleet Console' : 'Open Fleet Console'}
              className={`flex h-9 sm:h-10 items-center gap-2 rounded-full border px-3 sm:px-3.5 transition-all active:scale-95 cursor-pointer shadow-2xs text-xs font-bold ${
                activeRole === 'admin'
                  ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                  : 'border-black/[0.08] bg-white text-[#111111] hover:bg-[#F7F7F5]'
              }`}
            >
              <Shield className="h-3.5 w-3.5 stroke-[2.2]" />
              <span className="hidden sm:inline">
                {activeRole === 'admin' ? 'Exit Console' : 'Fleet Console'}
              </span>
            </button>
          )}

          {/* Stylized Profile Button */}
          <div className="relative">
            {isAuthenticated ? (
              <button
                id="btn-header-profile"
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                aria-label="User Profile"
                title={userProfile?.name || 'Your Account'}
                className="group relative flex items-center gap-2 pl-1.5 pr-2.5 sm:pr-3 py-1 sm:py-1.5 rounded-full border border-black/[0.07] bg-white/95 hover:bg-[#F7F7F5] text-[#111111] shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-all cursor-pointer"
              >
                {userProfile?.photoURL ? (
                  <img
                    src={userProfile.photoURL}
                    alt={userProfile.name}
                    className="h-7 w-7 sm:h-7.5 sm:w-7.5 rounded-full object-cover ring-1 ring-black/10"
                  />
                ) : (
                  <div className="flex h-7 w-7 sm:h-7.5 sm:w-7.5 items-center justify-center rounded-full bg-[#111111] text-white font-bold text-xs shadow-2xs">
                    {userProfile?.name?.charAt(0).toUpperCase() || <User className="h-3.5 w-3.5" />}
                  </div>
                )}
                
                <span className="text-xs font-semibold text-[#111111] hidden min-[440px]:inline max-w-[90px] sm:max-w-[120px] truncate">
                  {userProfile?.name?.split(' ')[0] || 'Account'}
                </span>

                <ChevronDown
                  className={`h-3.5 w-3.5 text-[#6B6B6B] transition-transform duration-200 ${
                    showUserMenu ? 'rotate-180 text-[#111111]' : 'group-hover:text-[#111111]'
                  }`}
                />

                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 rounded-full bg-[#FF7A00] ring-2 ring-white" />
                )}
              </button>
            ) : (
              <button
                id="btn-header-signin"
                type="button"
                onClick={() => onOpenAuth?.('signin', 'passenger')}
                aria-label="Sign In"
                className="flex items-center gap-2 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full border border-black/[0.08] bg-[#111111] hover:bg-neutral-800 text-white shadow-2xs hover:shadow-xs active:scale-95 transition-all text-xs font-bold cursor-pointer"
              >
                <User className="h-3.5 w-3.5" />
                <span>Sign In</span>
              </button>
            )}

            {/* Stylized Profile Menu Dropdown */}
            {showUserMenu && (
              <div className="absolute right-0 mt-2.5 w-72 max-w-[calc(100vw-24px)] rounded-[26px] border border-black/[0.06] bg-white/95 backdrop-blur-2xl p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.08)] z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#F7F7F5] border border-black/[0.04]">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FF7A00] text-white font-black text-sm shadow-[0_2px_8px_rgba(255,122,0,0.25)]">
                    {userProfile?.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#111111] truncate">
                      {userProfile?.name || 'ZAKA Member'}
                    </p>
                    <p className="text-[11px] font-medium text-[#6B6B6B] truncate">
                      {userProfile?.phone || userProfile?.email || (activeRole === 'driver' || userProfile?.role === 'driver' ? 'Active Driver' : activeRole === 'admin' ? 'Administrator' : 'Active Passenger')}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 space-y-1">
                  <button
                    onClick={() => {
                      onOpenProfile?.();
                      setShowUserMenu(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#111111] hover:bg-[#F7F7F5] transition-colors cursor-pointer"
                  >
                    <User className="h-4 w-4 text-[#6B6B6B]" />
                    <span>Manage Profile</span>
                  </button>

                  <button
                    onClick={() => {
                      onOpenHistory?.();
                      setShowUserMenu(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#111111] hover:bg-[#F7F7F5] transition-colors cursor-pointer"
                  >
                    <Clock className="h-4 w-4 text-[#6B6B6B]" />
                    <span>Trip History</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowNotificationCenterModal(true);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-[#111111] hover:bg-[#F7F7F5] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Bell className="h-4 w-4 text-[#6B6B6B]" />
                      <span>Notifications</span>
                    </div>
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-[#FF7A00] text-white px-2 py-0.5 text-[10px] font-black">
                        {unreadCount}
                      </span>
                    )}
                  </button>

                  <div className="pt-1 mt-1 border-t border-black/[0.04]">
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <LogOut className="h-4 w-4 text-red-500" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notification Center Modal */}
      {showNotificationCenterModal && userProfile?.uid && (
        <NotificationCenterModal
          userId={userProfile.uid}
          isOpen={showNotificationCenterModal}
          onClose={() => setShowNotificationCenterModal(false)}
        />
      )}
    </header>
  );
};
