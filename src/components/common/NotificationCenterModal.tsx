/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Live In-App Notification Centre
 * Real-time Firebase notification stream with filtering, unread badges, mark-as-read, and FCM push status.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NotificationRecord } from '../../types';
import { firestoreService } from '../../firebase/firestoreService';
import { notificationService } from '../../services/notificationService';
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  Car,
  CreditCard,
  Tag,
  Info,
  Clock,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface NotificationCenterModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  userId,
  isOpen,
  onClose,
}) => {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'ride' | 'payment'>('all');
  const [selectedNotification, setSelectedNotification] = useState<NotificationRecord | null>(null);

  useEffect(() => {
    if (!isOpen || !userId) return;

    const unsubscribe = firestoreService.listenToUserNotifications(userId, (data) => {
      setNotifications(data);
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filteredNotifications = notifications.filter((n) => {
    if (activeFilter === 'unread') return !n.read;
    if (activeFilter === 'ride') return n.type === 'ride';
    if (activeFilter === 'payment') return n.type === 'payment';
    return true;
  });

  const handleMarkAllRead = async () => {
    if (userId) {
      await firestoreService.markAllNotificationsRead(userId);
    }
  };

  const handleItemClick = async (item: NotificationRecord) => {
    setSelectedNotification(item);
    if (!item.read) {
      await firestoreService.markNotificationRead(item.id);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await firestoreService.deleteNotification(id);
    if (selectedNotification?.id === id) {
      setSelectedNotification(null);
    }
  };

  const getIcon = (type: NotificationRecord['type']) => {
    switch (type) {
      case 'ride':
        return <Car className="h-4 w-4 text-ink" />;
      case 'payment':
        return <CreditCard className="h-4 w-4 text-success" />;
      case 'promo':
        return <Tag className="h-4 w-4 text-amber-600" />;
      default:
        return <Info className="h-4 w-4 text-blue-600" />;
    }
  };

  const fcmStatus = notificationService.getPushNotificationStatus();

  // Rendered on <body>: the header's backdrop blur would otherwise trap this fixed overlay inside the header bar
  return createPortal(
    <div
      id="notification-center-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="flex h-[90vh] max-h-[680px] w-full max-w-lg flex-col rounded-[20px] border border-line bg-white shadow-modal overflow-hidden text-left">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-ink">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[11px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">Notifications</h2>
              <p className="text-[11px] text-ink-3">
                {unreadCount === 0 ? 'All caught up' : `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1.5 text-[11px] font-bold text-ink-2 hover:bg-neutral-200 transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mark all read</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink-2 hover:bg-neutral-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 border-b border-line px-5 py-2.5 bg-surface-2 overflow-x-auto scrollbar-none">
          {[
            { id: 'all', label: 'All' },
            { id: 'unread', label: `Unread (${unreadCount})` },
            { id: 'ride', label: 'Rides' },
            { id: 'payment', label: 'Payments' },
          ].map((f) => {
            const isSel = activeFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id as any)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-all whitespace-nowrap ${
                  isSel
                    ? 'bg-ink text-white shadow-card'
                    : 'bg-white text-ink-2 border border-line hover:bg-surface-2'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto divide-y divide-line p-2">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-neutral-400 mb-2">
                <Bell className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-ink">No notifications to display</p>
              <p className="text-xs text-ink-3 max-w-xs mt-1">
                {activeFilter === 'unread'
                  ? "You don't have any unread notifications."
                  : 'Trip updates, safety PIN alerts, and payment receipts will appear here in real-time.'}
              </p>
            </div>
          ) : (
            filteredNotifications.map((n) => {
              const isSelected = selectedNotification?.id === n.id;
              const formattedTime = new Date(n.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              const formattedDate = new Date(n.createdAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              });

              return (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`group relative flex items-start gap-3 rounded-card p-3.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-50/70 border border-amber-200'
                      : !n.read
                      ? 'bg-white hover:bg-surface-2 font-medium'
                      : 'bg-surface-2/70 text-ink-3 hover:bg-neutral-100/70'
                  }`}
                >
                  {/* Type Icon */}
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-xl shrink-0 mt-0.5 ${
                      !n.read ? 'bg-primary-100' : 'bg-neutral-200/60'
                    }`}
                  >
                    {getIcon(n.type)}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {!n.read && (
                          <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                        )}
                        <h4
                          className={`text-xs truncate ${
                            !n.read ? 'font-bold text-ink' : 'font-bold text-ink'
                          }`}
                        >
                          {n.title}
                        </h4>
                      </div>
                      <span className="text-[11px] text-neutral-400 shrink-0 font-medium">
                        {formattedDate} {formattedTime}
                      </span>
                    </div>

                    <p className="text-xs text-ink-2 line-clamp-2 leading-relaxed">
                      {n.message}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, n.id)}
                      className="p-1 text-neutral-400 hover:text-danger transition-colors"
                      title="Delete notification"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with FCM Push Architecture Status Note */}
        <div className="border-t border-line bg-surface-2 px-5 py-3 text-[11px] text-ink-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span className="font-semibold text-ink-2">Real-time In-App Live</span>
          </div>
          <span className="text-[11px] text-neutral-400">Push (FCM) Ready</span>
        </div>
      </div>
    </div>,
    document.body
  );
};
