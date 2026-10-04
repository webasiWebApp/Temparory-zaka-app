/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Technical Compliance & Legal Transparency Modal
 * Provides transparent technical summaries for POPIA (Protection of Personal Information Act),
 * Terms of Service, Operating Licence Standards, and Data Subject inquiries.
 */

import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  FileText,
  Lock,
  Scale,
  AlertCircle,
  CheckCircle2,
  Mail,
  UserCheck,
  Building,
  Car,
} from 'lucide-react';

interface ComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'terms' | 'popia' | 'regulatory';
}

export const ComplianceModal: React.FC<ComplianceModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'terms',
}) => {
  const [activeTab, setActiveTab] = useState<'terms' | 'popia' | 'regulatory'>(defaultTab);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative flex flex-col w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-[20px] border border-line bg-white shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 bg-surface-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-card bg-ink text-white">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">ZAKA Legal & Compliance Hub</h2>
              <p className="text-xs text-ink-3">South African Regulatory & POPIA Framework</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-200 hover:text-ink transition-all"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-line px-6 gap-2 bg-white pt-2">
          {[
            { id: 'terms', label: 'Terms of Service', icon: FileText },
            { id: 'popia', label: 'POPIA Privacy Notice', icon: Lock },
            { id: 'regulatory', label: 'Driver & Operating Licences', icon: Car },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-bold transition-all ${
                  isSelected
                    ? 'border-primary text-ink'
                    : 'border-transparent text-ink-3 hover:text-ink'
                }`}
              >
                <Icon className={`h-4 w-4 ${isSelected ? 'text-ink' : 'text-neutral-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-ink-2 leading-relaxed">
          {/* TAB 1: TERMS OF SERVICE */}
          {activeTab === 'terms' && (
            <div className="space-y-4">
              <div className="rounded-card border border-amber-200 bg-amber-50/60 p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-900 font-bold">
                  <ShieldCheck className="h-4 w-4 text-amber-700" />
                  <span>Platform Agreement Overview</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  By accessing or registering with ZAKA, passengers and drivers agree to operate with integrity, adhere to South African road traffic laws, and maintain zero tolerance for harassment, discrimination, or reckless driving.
                </p>
              </div>

              <section className="space-y-2">
                <h3 className="font-bold text-ink text-sm">1. Ride Booking & Fare Acceptance</h3>
                <p>
                  All fares displayed on ZAKA are calculated using dynamic base rates, distance, and estimated travel time in South African Rand (ZAR). A minimum fare applies to protect driver viability. Fares are locked upon driver acceptance and can only adjust if the route or destination is officially modified during transit.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-bold text-ink text-sm">2. Driver-Passenger Safety & OTP Code</h3>
                <p>
                  To prevent unauthorized boardings, passengers are provided a 4-digit ride verification OTP upon dispatch. Drivers must input or verify this OTP before starting the trip. Both parties must treat each other with mutual dignity.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-bold text-ink text-sm">3. Payments & Commission Model</h3>
                <p>
                  ZAKA operates on a transparent 85/15 model. Drivers retain 85% of standard trip fares, with a 15% platform technology commission deducted to maintain routing, verification, infrastructure, and support services. Drivers collecting cash agree to declare and settle platform fees honestly.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-bold text-ink text-sm">4. Cancellation Guidelines</h3>
                <p>
                  Passengers may cancel free of charge while the system is searching for a nearby vehicle. Once a driver has been dispatched and is en route, repeated or abusive cancellations may affect account standing. Drivers may only cancel under valid safety, mechanical, or unreachable passenger conditions.
                </p>
              </section>

              <div className="rounded-xl bg-surface-2 p-3 text-[11px] text-ink-3">
                * Note: ZAKA reserves the right to suspend or terminate accounts that breach safety standards, manipulate geolocation telemetry, or attempt fee circumvention.
              </div>
            </div>
          )}

          {/* TAB 2: POPIA PRIVACY NOTICE */}
          {activeTab === 'popia' && (
            <div className="space-y-4">
              <div className="rounded-card border border-blue-200 bg-blue-50/60 p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-blue-900 font-bold">
                  <Lock className="h-4 w-4 text-blue-700" />
                  <span>POPIA Compliance Notice (Act 4 of 2013)</span>
                </div>
                <p className="text-[11px] text-blue-800">
                  ZAKA processes personal information strictly in accordance with South Africa's Protection of Personal Information Act (POPIA). We collect only what is strictly necessary to provide safe transportation and dispatch.
                </p>
              </div>

              <section className="space-y-2">
                <h3 className="font-bold text-ink text-sm">1. Personal Information Collected</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Account Data:</strong> Name, verified South African mobile phone number, email address, profile photo.</li>
                  <li><strong>Live Geolocation:</strong> Device GPS coordinates during active app usage to match nearest drivers, provide pickup navigation, and calculate live ETAs.</li>
                  <li><strong>Driver Verification Records:</strong> Identity documents, PrDP permits, vehicle registration (RC1), roadworthy certificates, and municipal operating licences.</li>
                  <li><strong>Transaction Records:</strong> Trip origins, destinations, timestamps, fare amounts, and payment references. Electronic card payments are tokenized securely through Peach Payments PCI-DSS Level 1 compliant gateway; ZAKA never stores raw credit card CVV or PAN numbers.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="font-bold text-ink text-sm">2. Purpose of Processing</h3>
                <p>
                  Data is processed to: (a) facilitate ride dispatches between passengers and vetted drivers; (b) compute deterministic trip fares; (c) maintain real-time safety monitoring; and (d) comply with statutory accounting and transport regulations.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-bold text-ink text-sm">3. Data Sharing & Privacy Safeguards</h3>
                <p>
                  Passengers' live GPS coordinates and phone numbers are only shared with the specifically assigned driver for the duration of the trip. Public radar displays approximate vehicle markers without personal driver details. Driver verification documents are stored in secure subcollections accessible solely by the driver and authorized ZAKA compliance administrators.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-bold text-ink text-sm">4. Your Data Subject Rights</h3>
                <p>
                  Under POPIA, you have the right to request access to, correction of, or deletion of your personal data when no longer required for statutory tax or transport retention. To submit a data subject inquiry, contact our Information Officer:
                </p>
                <div className="flex items-center gap-2 text-xs font-bold text-ink">
                  <Mail className="h-4 w-4 text-primary-text" />
                  <span>privacy@zaka.co.za</span>
                  <span className="text-neutral-400 font-normal">| Information Officer, ZAKA Technologies</span>
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: DRIVER & OPERATING LICENCES */}
          {activeTab === 'regulatory' && (
            <div className="space-y-4">
              <div className="rounded-card border border-emerald-200 bg-emerald-50/60 p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-900 font-bold">
                  <Building className="h-4 w-4 text-success" />
                  <span>National Land Transport Act (NLTA) & Municipal Permits</span>
                </div>
                <p className="text-[11px] text-emerald-800">
                  ZAKA supports compliance with South African municipal e-hailing regulations, Provincial Regulatory Entities (PRE), and National Land Transport frameworks.
                </p>
              </div>

              <section className="space-y-2">
                <h3 className="font-bold text-ink text-sm">1. Operating Licence / PRE Charter Permit</h3>
                <p>
                  E-hailing operators are required by law to hold or have an active application receipt for a valid Operating Licence issued by the relevant Provincial Regulatory Entity (e.g. Gauteng PRE, Western Cape PRE). ZAKA provides technical fields in the driver portal to record the permit application/licence number and upload supporting receipts.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-bold text-ink text-sm">2. Professional Driving Permit (PrDP)</h3>
                <p>
                  All drivers must possess a valid Category 'G' or 'P' Professional Driving Permit endorsement on their South African driver's licence. Accounts cannot be approved without administrative verification of this credential.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-bold text-ink text-sm">3. Certificate of Fitness & Roadworthy (COF)</h3>
                <p>
                  All vehicles operating on ZAKA must undergo annual 100-point roadworthiness inspection by an accredited testing station (e.g. DEKRA or AVTS) to ensure tyres, brakes, suspension, and safety belts are in roadworthy condition.
                </p>
              </section>

              <div className="rounded-xl border border-line bg-surface-2 p-3 text-[11px] text-ink-3">
                <strong>Notice:</strong> This information provides technical transparency regarding platform standards and documentation requirements. It does not replace independent legal or municipal regulatory counsel.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-line px-6 py-3.5 bg-surface-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-neutral-400">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            <span>ZAKA Platform Policies • Updated 2026</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-ink px-5 py-2 text-xs font-bold text-white hover:bg-ink transition-all"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
};
