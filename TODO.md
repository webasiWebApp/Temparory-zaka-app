1. Driver becomes Rider — Fix authentication, profile and role logic so Drivers remain Drivers after registration/login.

2. Wrong phone number — Fix phone storage/display so the correct registered number is shown.

3. Email verification — Fix registration, verification emails and verified-account handling.

4. Email/password login — Fix Firebase authentication and profile loading.

5. GPS & Maps — Fix map integration, API configuration and location flow.

6. Fare calculation — Make fare calculation consistent and secure.

7. Ride PIN — Make the 4-digit PIN mandatory before starting a trip.

8. Ride status flow — Fix the complete Rider → Driver → completed ride lifecycle.

9. Driver registration — Fix Driver account/profile creation and correct role assignment.

10. Document upload — Fix Driver document uploads and secure storage.

11. Admin document preview — Fix secure Admin viewing of Driver documents.

12. Driver completion — Fix Driver permissions for starting/completing rides.

13. Driver earnings — Fix the 85% Driver / 15% ZAKA calculation and data flow.

14. Wallet — Replace the mock wallet with actual wallet functionality.

15. Cash payment — Complete payment recording and ledger functionality.

16. Card/Peach Payments — Complete integration where credentials/API access are available.

17. Firebase security — Review and secure Firestore and Storage rules.

18. Admin security — Secure Admin authorization and prevent unauthorized access.

19. Payment security — Secure payment confirmation and webhook handling.

20. Push notifications — Complete Rider/Driver notifications.

21. Wallet navigation — Fix Wallet button/navigation.

22. Profile → Home — Fix Profile exit/navigation back to Home.

23. iPhone registration — Fix native registration, API URLs, timeouts and networking.

24. iOS authentication — Fix native Google/authentication flow.

25. Crashes — Trace and fix actual crash causes.

26. Production build — Remove demo code and finalize production configuration.

27. Exposed credentials — Identify, remove and rotate credentials that are actually exposed.

28. Complete testing — Test the full Rider → Driver → Admin workflow, including authentication, rides, payments, security and critical edge cases.

29. Any logged-in user can read all ratings, including comments and tips.
30.When a driver closes the browser, the app sometimes fails to mark them offline.
31.The fake GPS movement used for testing keeps restarting, which wastes the device's power.
32.There is no rule to delete old personal data after a set period (POPIA).
33.Users cannot download their own data, such as location history (POPIA).
34.Data from guest users who never fully signed up is never cleaned up (POPIA).
35.It has not been decided whether WhatsApp can be used for ride updates.
36.The project plan shows every task as "not done", even though most are built.
37.Some parts of the system, such as incidents, audit logs and support, are missing from the project plan.