# ZAKA Driver App Testing Report — Driver-Only Items

Items already covered in the passenger checklist have been removed. Original item numbers are kept.

---

## 1. Driver Registration and Application Process

- [ ] **1. Missing Driver Application Page**
  Drivers should complete an application process and submit supporting documents for verification and approval. This page is no longer visible in the app. Restore the driver application page and ensure the full process works.

- [ ] **2. Required Supporting Documents**
  During registration, drivers must be able to upload the following documents:
  - [ ] Vehicle registration documents
  - [ ] Proof of vehicle ownership
  - [ ] Professional Driving Permit (PDP)
  - [ ] ID document
  - [ ] Proof of address

---

## 2. Vehicle Information and Restrictions

- [ ] **4. Restrict Vehicle Information Editing**
  After registration, drivers must not be able to change the following vehicle information:
  - [ ] Vehicle make
  - [ ] Vehicle model
  - [ ] Vehicle colour
  - [ ] Licence plate number
  - [ ] Vehicle class

  These details should remain fixed after registration to maintain accurate vehicle records and support the driver verification process.

---

## 3. Driver Profile Information

- [ ] **5. Required Profile Fields**
  Add the following fields to the driver profile:
  - [ ] Home Address

- [ ] **6. Restrict Editing of Personal Information**
  Drivers must not be able to change the following information after registration:
  - [ ] Phone Number
  - [ ] Email Address

- [ ] **7. Protect Sensitive Information**
  The following information must not be visible to passengers:
  - [ ] Date of Birth
  - [ ] Nationality
  - [ ] ID Number

  This information should only be accessible to authorised personnel for verification and administrative purposes.

---

## 5. GPS and Location Issues

- [ ] **10. Persistent GPS Warning**
  The app repeatedly displays a "GPS Warning" message. Investigate the cause and resolve the issue to ensure the driver's location is detected accurately and consistently.

---

## Priority Summary

**HIGH PRIORITY**
Restore driver application and document submission; resolve GPS Warning; restrict changes to verified personal and vehicle information; hide sensitive information from passengers.

**MEDIUM PRIORITY**
Add required profile fields.

**UI / DESIGN**
Ensure the driver interface is consistent and functional.

---

## Removed (already in the passenger checklist)

- 3. Driver Identity Verification (same as passenger #11)
- 5. Required Profile Fields — Date of Birth, Gender, Nationality, ID Number (same as passenger #9)
- 6. Restrict Editing — Full Name, Nationality, Date of Birth, Gender, ID Number (same as passenger #10)
- 8. Remove Random Profile Picture Selection (same as passenger #6)
- 9. Enable Driver Profile Picture Upload (same as passenger #7)
- 11. ZAKA Logo Navigation (same as passenger #17)
- 12. Map Design (same as passenger #16)
- 13. Notifications Popup (same as passenger #18)