# ZAKA App Testing Report

Passenger registration, account settings, ride booking, map behaviour and interface issues.

---

## 1. Passenger Issues

### A. Sign-In and Registration

- [ ] **1. Google Sign-In**
  When signing in with a Google account, the app automatically signs the user into a passenger account.

- [ ] **2. Phone Number Verification**
  During passenger registration, the app does not verify the phone number using an OTP. It accepts any number entered.
  Implement OTP verification.

- [ ] **3. Password Reset**
  Password reset emails are being delivered to the recipient's spam folder. Review the email configuration to improve deliverability.

### B. Profile and Account Settings

- [ ] **4. Favourite Locations — Map Pinning**
  Passengers cannot pin or select saved favourite addresses on the map.

- [ ] **5. Favourite Locations — Data Persistence**
  Saved favourite locations disappear after the passenger signs out and signs back in. These locations must remain saved to the user's account.

- [ ] **6. Profile Picture Selection**
  The Account Settings page displays random people's photos for passengers to choose from. Remove this option.

- [ ] **7. Driver Profile Picture**
  Provide drivers with an option to upload their own profile picture during registration.

- [ ] **8. Profile Updates**
  Updating profile information currently produces an error. Investigate and resolve this issue.

### C. Profile Information and Verification

- [ ] **9. Required Profile Fields**
  Add the following fields to the passenger profile:
  - [ ] Date of Birth (YYYY/MM/DD)
  - [ ] Gender (Male/Female)
  - [ ] Nationality
  - [ ] ID Number

- [ ] **10. Restrict Profile Editing**
  The following information must not be editable after registration:
  - [ ] Name and Surname
  - [ ] Date of Birth
  - [ ] Gender
  - [ ] Nationality
  - [ ] ID Number

- [ ] **11. Passenger Identity Verification**
  During registration, passengers must be required to:
  - [ ] Upload a photograph of their ID document.
  - [ ] Take a live photo using the ZAKA app.
  - [ ] Submit both images for verification and approval before being approved to use the service.

---

## 2. Ride Booking and Map Issues

- [ ] **12. Road Route Illustration**
  After selecting a pickup location and destination, the map displays a straight line between the two points. Replace this with the actual road route to the destination.

- [ ] **13. Ride Type Icons**
  Replace the emojis currently used for the different ride types with simple, professional icons.

- [ ] **14. Confirm Ride Button**
  The Confirm Ride button does not work when clicked. Investigate and fix the functionality so passengers can confirm their bookings.

- [ ] **15. Remove Moto Option**
  Remove the Moto ride option from the available ride types.

- [ ] **16. Map Design**
  Change the map to a black-and-white style. Only the following elements should remain in colour:
  - [ ] Pickup location
  - [ ] Destination
  - [ ] Route illustration

---

## 3. Navigation and User Interface

- [ ] **17. ZAKA Logo Navigation**
  When a user clicks the ZAKA logo/icon, the app should navigate back to the Home page.

- [ ] **18. Notifications Popup**
  After clicking Notifications, the popup remains visible even when the user clicks elsewhere on the screen. Make the popup close automatically when the user clicks outside it.

---

