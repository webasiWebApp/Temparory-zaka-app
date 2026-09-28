/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Notification Service
 * Handles In-App Firebase notifications, event-driven alerts, and FCM Push architecture preparation.
 */

import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { NotificationRecord } from '../types';
import { firestoreService } from '../firebase/firestoreService';

export interface PushNotificationConfig {
  fcmToken?: string;
  isRegistered: boolean;
  provider: 'apns-fcm' | 'in-app-fallback';
  statusDescription: string;
}

let isPushRegistered = false;
let registeredToken: string | null = null;

export const notificationService = {
  // Push Notification Architecture Status
  getPushNotificationStatus(): PushNotificationConfig {
    if (Capacitor.isNativePlatform() && isPushRegistered && registeredToken) {
      return {
        isRegistered: true,
        fcmToken: registeredToken,
        provider: 'apns-fcm',
        statusDescription: 'Apple Push Notification service (APNs) and FCM token registered on native iOS.',
      };
    }
    return {
      isRegistered: isPushRegistered,
      provider: Capacitor.isNativePlatform() ? 'apns-fcm' : 'in-app-fallback',
      statusDescription: Capacitor.isNativePlatform()
        ? 'Native APNs push listener ready.'
        : 'Firebase Cloud Messaging (FCM) is architected for background push notifications. In-App real-time Firestore notifications are fully active and live.',
    };
  },

  /**
   * Registers for native iOS push notifications via APNs and securely saves device token to user's profile
   */
  async registerNativePush(userId: string): Promise<string | null> {
    if (!Capacitor.isNativePlatform() || !userId) {
      return null;
    }

    try {
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        console.warn('APNs push notification permission denied by user.');
        return null;
      }

      await PushNotifications.register();

      // Listen for device token
      PushNotifications.addListener('registration', async (token: Token) => {
        isPushRegistered = true;
        registeredToken = token.value;
        try {
          // Store device token securely in user's profile on Firestore
          await firestoreService.updateUserProfile(userId, {
            pushDeviceToken: token.value,
            pushPlatform: 'ios',
            pushTokenUpdatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('Could not persist device push token:', err);
        }
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.warn('Error registering for push notifications:', err);
      });

      PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        console.log('Push notification received foreground:', notification.title);
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
        console.log('Push notification action tapped:', action.notification);
      });

      return registeredToken;
    } catch (err) {
      console.warn('Failed to initialize push notifications:', err);
      return null;
    }
  },

  /**
   * Helper to dispatch standard ride lifecycle notifications safely
   */
  async notifyRideEvent(
    userId: string,
    event:
      | 'driver_found'
      | 'driver_accepted'
      | 'driver_en_route'
      | 'driver_arriving'
      | 'driver_arrived'
      | 'ride_started'
      | 'ride_completed'
      | 'trip_started'
      | 'trip_completed'
      | 'payment_due'
      | 'payment_received'
      | 'payment_successful'
      | 'payment_failed'
      | 'ride_cancelled'
      | 'new_request'
      | 'new_ride_request'
      | 'passenger_cancelled'
      | 'payment_confirmed'
      | 'earnings_updated'
      | 'verification_approved'
      | 'verification_rejected'
      | 'documents_attention'
      | 'admin_new_driver'
      | 'admin_docs_review'
      | 'admin_payment_issue',
    details: {
      rideId?: string;
      driverName?: string;
      passengerName?: string;
      amount?: number;
      destination?: string;
      pin?: string;
      vehicleInfo?: string;
      reason?: string;
      earnings?: number;
    }
  ): Promise<void> {
    let title = '';
    let message = '';
    let type: NotificationRecord['type'] = 'ride';

    switch (event) {
      case 'driver_found':
        title = 'Driver Found';
        message = `A nearby driver has been found for your trip. Awaiting driver confirmation.`;
        type = 'ride';
        break;

      case 'driver_accepted':
        title = 'Driver Accepted Your Ride';
        message = `${details.driverName || 'Your driver'} is assigned in a ${details.vehicleInfo || 'vehicle'}. Safety PIN: ${details.pin || '----'}`;
        type = 'ride';
        break;

      case 'driver_en_route':
      case 'driver_arriving':
        title = 'Driver is Arriving';
        message = `${details.driverName || 'Your driver'} is heading to your pickup spot. Please be ready outside.`;
        type = 'ride';
        break;

      case 'driver_arrived':
        title = 'Driver has Arrived';
        message = `${details.driverName || 'Your driver'} has reached the pickup spot. Share your PIN (${details.pin || ''}) to start.`;
        type = 'ride';
        break;

      case 'ride_started':
      case 'trip_started':
        title = 'Trip Started';
        message = `Heading towards ${details.destination || 'your destination'}. Safety tracking active.`;
        type = 'ride';
        break;

      case 'ride_completed':
      case 'trip_completed':
        title = 'Trip Completed';
        message = `You have arrived safely at ${details.destination || 'your destination'}. Final fare: R${(details.amount || 0).toFixed(2)}.`;
        type = 'ride';
        break;

      case 'payment_due':
        title = 'Payment Due';
        message = `Please hand R${(details.amount || 0).toFixed(2)} in cash directly to your driver.`;
        type = 'payment';
        break;

      case 'payment_received':
      case 'payment_successful':
        title = 'Payment Successful ✓';
        message = `Payment of R${(details.amount || 0).toFixed(2)} was securely verified and confirmed. Thank you for riding with ZAKA!`;
        type = 'payment';
        break;

      case 'payment_failed':
        title = 'Payment Failed';
        message = `Electronic payment attempt could not be completed: ${details.reason || 'Transaction declined'}. Please retry or settle via Cash.`;
        type = 'payment';
        break;

      case 'ride_cancelled':
        title = 'Ride Cancelled';
        message = details.reason ? `Ride was cancelled: ${details.reason}` : `Your ride was cancelled.`;
        type = 'ride';
        break;

      case 'new_request':
      case 'new_ride_request':
        title = 'New Ride Request';
        message = `New pickup request from ${details.passengerName || 'Passenger'} to ${details.destination || 'Destination'}.`;
        type = 'ride';
        break;

      case 'passenger_cancelled':
        title = 'Passenger Cancelled';
        message = `The passenger has cancelled the ride request. You are available for new dispatches.`;
        type = 'ride';
        break;

      case 'payment_confirmed':
        title = 'Payment Confirmed';
        message = `Payment of R${(details.amount || 0).toFixed(2)} has been confirmed for trip #${(details.rideId || '').slice(0, 6)}.`;
        type = 'payment';
        break;

      case 'earnings_updated':
        title = 'Driver Earnings Updated';
        message = `+R${(details.earnings || 0).toFixed(2)} (85% net earnings) credited to your ZAKA driver account.`;
        type = 'payment';
        break;

      case 'verification_approved':
        title = 'Verification Approved ✓';
        message = `Congratulations! Your ZAKA driver documents have been approved. You are now authorized to go online.`;
        type = 'system';
        break;

      case 'verification_rejected':
        title = 'Verification Update Required';
        message = `Your driver documents require attention: ${details.reason || 'Please review and re-upload required credentials.'}`;
        type = 'system';
        break;

      case 'documents_attention':
        title = 'Documents Require Attention';
        message = `Please upload your PrDP, Driver Licence, and Vehicle Roadworthy certificates to maintain active driver status.`;
        type = 'system';
        break;

      case 'admin_new_driver':
        title = 'New Driver Registered';
        message = `A new driver profile (${details.driverName || 'Driver'}) registered and awaits document submission.`;
        type = 'system';
        break;

      case 'admin_docs_review':
        title = 'Documents Awaiting Review';
        message = `Driver ${details.driverName || 'Applicant'} submitted credentials for roadworthy/licence verification.`;
        type = 'system';
        break;

      case 'admin_payment_issue':
        title = 'Payment Alert';
        message = `Payment alert on trip #${(details.rideId || '').slice(0, 6)}: ${details.reason || 'Gateway reported error'}.`;
        type = 'payment';
        break;
    }

    if (userId && title && message) {
      await firestoreService.sendNotification({
        userId,
        title,
        message,
        type,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
  },
};
