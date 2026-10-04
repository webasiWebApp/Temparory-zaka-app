/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Main Application Entry
 * Styling & Theme: Clean white backgrounds, bold black route lines, #FFC107 yellow vehicle markers and action buttons
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/common/Header';
import { PassengerApp } from './components/passenger/PassengerApp';
import { DriverApp } from './components/driver/DriverApp';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AuthModal } from './components/auth/AuthModal';
import { UserProfileModal } from './components/auth/UserProfileModal';
import { VerifyEmailScreen } from './components/auth/VerifyEmailScreen';
import { RideHistoryModal } from './components/passenger/RideHistoryModal';
import { DemoTestBanner } from './components/demo/DemoTestBanner';
import { UserRole } from './types';
import { isRiderTarget } from './config/appTarget';

const AppContent: React.FC = () => {
  const { currentUser, userProfile, activeRole, roles, isAdmin, isDemoTestMode, loading, isEmailVerified } = useAuth();
  const [authConfig, setAuthConfig] = useState<{
    isOpen: boolean;
    mode?: 'signin' | 'signup' | 'forgot';
    role?: UserRole;
  }>({
    isOpen: false,
    mode: 'signin',
    role: undefined,
  });
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const isAuthenticated = Boolean(currentUser && userProfile);

  // Automatically close auth modal whenever authenticated session is active
  React.useEffect(() => {
    if (isAuthenticated) {
      setAuthConfig((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
    }
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#F7F7F5]">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-[#FF7A00] to-[#FFA000] text-white shadow-[0_4px_16px_rgba(255,122,0,0.28)] animate-pulse font-black text-xl">
            Z
          </div>
          <p className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">
            Loading ZAKA...
          </p>
        </div>
      </div>
    );
  }

  const handleOpenAuth = (mode: 'signin' | 'signup' | 'forgot' = 'signin', role?: UserRole) => {
    setAuthConfig({
      isOpen: true,
      mode,
      role: role || (isRiderTarget ? 'passenger' : undefined),
    });
  };

  const handleCloseAuth = () => {
    setAuthConfig((prev) => ({ ...prev, isOpen: false }));
  };

  const handleOpenProfile = () => {
    if (isAuthenticated) {
      setIsProfileOpen(true);
    } else {
      handleOpenAuth('signin', 'passenger');
    }
  };

  const handleCloseProfile = () => {
    setIsProfileOpen(false);
  };

  const handleOpenHistory = () => {
    if (isAuthenticated) {
      setIsHistoryOpen(true);
    } else {
      handleOpenAuth('signin', 'passenger');
    }
  };

  const handleCloseHistory = () => {
    setIsHistoryOpen(false);
  };

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] flex-col bg-[#F7F7F5] font-sans antialiased text-[#111111] select-none overflow-hidden w-full">
      {/* Global Navigation Header: Rendered for authenticated sessions */}
      {isAuthenticated && (
        <Header
          onOpenAuth={handleOpenAuth}
          onOpenProfile={handleOpenProfile}
          onOpenHistory={handleOpenHistory}
        />
      )}

      {/* Demo Test Mode Banner & Persona Switcher (Web Target Only, Authenticated Sessions Only) */}
      {isAuthenticated && !isRiderTarget && (isDemoTestMode || userProfile?.isDemo) &&
        (activeRole === 'passenger' || activeRole === 'driver') && (
          <DemoTestBanner />
        )}

      {/* Email Verification Gate: Block authenticated non-verified users from protected operations */}
      {isAuthenticated && !isEmailVerified ? (
        <main className="flex-1 flex flex-col w-full min-h-0 h-full relative overflow-hidden">
          <VerifyEmailScreen />
        </main>
      ) : (
        /* Main Role-Based Views: Strictly verified authorization */
        <main className="flex-1 flex flex-col w-full min-h-0 h-full relative overflow-hidden">
          {!isRiderTarget && activeRole === 'admin' && isAdmin ? (
            <AdminDashboard />
          ) : !isRiderTarget && (activeRole === 'driver' || userProfile?.role === 'driver' || userProfile?.activeRole === 'driver') ? (
            <DriverApp />
          ) : (
            <PassengerApp
              onOpenAuth={handleOpenAuth}
              onOpenProfile={handleOpenProfile}
              onOpenHistory={handleOpenHistory}
              isProfileOpen={isProfileOpen}
              onCloseProfile={handleCloseProfile}
              isHistoryOpen={isHistoryOpen}
              onCloseHistory={handleCloseHistory}
            />
          )}
        </main>
      )}

      {/* Auth, Profile & History Dialogs */}
      <AuthModal
        isOpen={authConfig.isOpen}
        initialMode={authConfig.mode}
        initialRole={authConfig.role}
        onClose={handleCloseAuth}
      />
      <UserProfileModal isOpen={isProfileOpen} onClose={handleCloseProfile} />
      <RideHistoryModal isOpen={isHistoryOpen} onClose={handleCloseHistory} />
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
