/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - iPhone-Style Floating Glass Navigation Selector
 * Features:
 * - Translucent frosted glass surface with deep backdrop blur
 * - Floating elevated capsule/pill indicator animated via spring physics
 * - ZAKA orange brand accent for active item & soft ambient reflection
 * - iPhone safe-area inset bottom integration
 * - Mobile-first responsive sizing without horizontal scroll (320px - 414px+)
 * - Accessible touch targets (>= 44px) and ARIA tablist semantics
 */

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Home, Car, Wallet, User } from 'lucide-react';

export type NavTabId = 'home' | 'rides' | 'wallet' | 'profile';

export interface GlassNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  ariaLabel?: string;
}

export const DEFAULT_PASSENGER_NAV_ITEMS: GlassNavItem[] = [
  { id: 'home', label: 'Home', icon: Home, ariaLabel: 'Home and ride booking' },
  { id: 'rides', label: 'Rides', icon: Car, ariaLabel: 'Ride history and active trips' },
  { id: 'wallet', label: 'Wallet', icon: Wallet, ariaLabel: 'Payment methods and balance' },
  { id: 'profile', label: 'Profile', icon: User, ariaLabel: 'Profile and settings' },
];

export interface GlassSelectorNavProps {
  items?: GlassNavItem[];
  activeId?: string;
  onChange?: (id: string) => void;
  activeTab?: NavTabId;
  onTabChange?: (tab: NavTabId) => void;
  className?: string;
  layoutId?: string;
  ariaLabel?: string;
}

export const GlassSelectorNav: React.FC<GlassSelectorNavProps> = ({
  items = DEFAULT_PASSENGER_NAV_ITEMS,
  activeId,
  onChange,
  activeTab,
  onTabChange,
  className = '',
  layoutId = 'zaka-glass-nav-pill',
  ariaLabel = 'Primary Navigation',
}) => {
  const shouldReduceMotion = useReducedMotion();
  const currentActiveId = activeTab || activeId || items[0]?.id || 'home';

  const handleSelect = (id: string) => {
    if (onTabChange) {
      onTabChange(id as NavTabId);
    }
    if (onChange) {
      onChange(id);
    }
  };

  return (
    <nav
      aria-label={ariaLabel}
      className={`fixed bottom-0 left-0 right-0 z-[60] pointer-events-none flex flex-col items-center px-3 sm:px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] ${className}`}
    >
      {/* Translucent Frosted Glass Outer Container */}
      <div
        role="tablist"
        className="pointer-events-auto relative flex w-full max-w-sm sm:max-w-md md:max-w-lg items-center justify-between rounded-full p-1.5 bg-white shadow-raised transition-all"
        style={{
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        {/* Subtle Top-Edge Glass Reflection */}
        <div className="pointer-events-none absolute inset-x-8 top-0 h-[1px] bg-transparent" />

        {items.map((item) => {
          const Icon = item.icon;
          const isActive = currentActiveId === item.id;

          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={isActive}
              aria-label={item.ariaLabel || item.label}
              onClick={() => handleSelect(item.id)}
              className="relative flex-1 min-w-0 flex flex-col items-center justify-center py-1.5 px-1 sm:px-3 rounded-full min-h-[48px] cursor-pointer select-none transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.96]"
            >
              {/* Floating Glass Capsule/Pill (Animated behind content) */}
              {isActive && (
                <motion.div
                  layoutId={shouldReduceMotion ? undefined : layoutId}
                  className="absolute inset-0 rounded-full bg-primary-50 z-0"
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : {
                          type: 'spring',
                          stiffness: 450,
                          damping: 34,
                        }
                  }
                  style={{
                    WebkitBackdropFilter: 'blur(24px)',
                  }}
                />
              )}

              {/* Foreground Tab Content: Icon & Label */}
              <div className="relative z-10 flex flex-col items-center justify-center gap-0.5 sm:gap-1 w-full">
                <div className="relative flex items-center justify-center">
                  <Icon
                    className={`h-4.5 w-4.5 sm:h-5 sm:w-5 transition-all duration-200 ${
                      isActive
                        ? 'text-primary-text stroke-[2.4] scale-105'
                        : 'text-ink-3 stroke-[2] group-hover:text-ink'
                    }`}
                  />
                  {/* Badge (e.g. unread count) */}
                  {item.badge !== undefined && Number(item.badge) > 0 && (
                    <span className="absolute -top-1 -right-2 sm:-right-2.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-on-primary shadow-card">
                      {item.badge}
                    </span>
                  )}
                </div>

                <span
                  className={`text-[11px] sm:text-[11px] font-bold tracking-tight truncate max-w-full leading-tight transition-colors duration-200 ${
                    isActive ? 'text-primary-text font-bold' : 'text-ink-3'
                  }`}
                >
                  {item.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {/* iPhone Home Indicator Bar */}
      <div className="w-32 h-1 bg-neutral-900/90 rounded-full mx-auto mt-2 pointer-events-none hidden sm:block" />
    </nav>
  );
};

export interface InlineGlassSegmentedControlProps {
  items: Array<{
    id: string;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    badge?: number | string;
  }>;
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  layoutId?: string;
  ariaLabel?: string;
}

export const InlineGlassSegmentedControl: React.FC<InlineGlassSegmentedControlProps> = ({
  items,
  activeId,
  onChange,
  className = '',
  layoutId = 'zaka-inline-glass-pill',
  ariaLabel = 'View Selector',
}) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`relative flex items-center rounded-full p-1 bg-surface-2 ${className}`}
      style={{
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeId === item.id;

        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={isActive}
            aria-label={item.label}
            onClick={() => onChange(item.id)}
            className="relative flex-1 min-w-0 flex items-center justify-center gap-1.5 py-2 px-2.5 sm:px-3 rounded-full min-h-[44px] cursor-pointer select-none transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.97]"
          >
            {/* Floating Glass Pill */}
            {isActive && (
              <motion.div
                layoutId={shouldReduceMotion ? undefined : layoutId}
                className="absolute inset-0 rounded-full bg-white shadow-card z-0"
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : {
                        type: 'spring',
                        stiffness: 450,
                        damping: 34,
                      }
                }
              />
            )}

            {/* Content */}
            <div className="relative z-10 flex items-center justify-center gap-1.5 truncate">
              {Icon && (
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors duration-200 ${
                    isActive ? 'text-primary-text stroke-[2.4]' : 'text-ink-3 stroke-[2]'
                  }`}
                />
              )}
              <span
                className={`text-xs sm:text-xs font-bold truncate transition-colors duration-200 ${
                  isActive ? 'text-primary-text font-bold' : 'text-ink-2'
                }`}
              >
                {item.label}
              </span>
              {item.badge !== undefined && Number(item.badge) > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-on-primary shadow-card">
                  {item.badge}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

