// 1. STATE MANAGEMENT
        let currentUser = null;
        let currentStep = 1;
        let activePaymentMethod = 'ewallet';
        let pendingAuthUser = null;
        let pendingOtp = '123456';
        let sessionTimer = null;
        function safeReadJSON(key, fallback) {
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : fallback;
            } catch (error) {
                console.warn('Could not read local storage key:', key, error);
                return fallback;
            }
        }
        function safeWriteJSON(key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); return true; }
            catch (error) { console.warn('Could not save local storage key:', key, error); return false; }
        }
        function escapeHTML(value) {
            return String(value ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
        }
        let applicationHistory = safeReadJSON('alaeLoanApplications', []);
        if (!Array.isArray(applicationHistory)) applicationHistory = [];

        // Sample initial payment history state
        const samplePaymentHistory = [
            {
                ref: '#ALAE-2026-88102',
                date: 'Sep 25, 2026 • 10:15 AM',
                account: 'AL-PL-884920',
                loanType: 'Personal Loan',
                method: 'GCash E-Wallet',
                amount: 8750.00,
                status: 'SUCCESS'
            },
            {
                ref: '#ALAE-2026-74911',
                date: 'Aug 24, 2026 • 02:40 PM',
                account: 'AL-PL-884920',
                loanType: 'Personal Loan',
                method: 'Visa Debit Card',
                amount: 8750.00,
                status: 'SUCCESS'
            },
            {
                ref: '#ALAE-2026-62019',
                date: 'Jul 22, 2026 • 11:05 AM',
                account: 'AL-VH-304912',
                loanType: 'Vehicle',
                method: 'Batangas Branch OTC',
                amount: 3200.00,
                status: 'SUCCESS'
            }
        ];
        let paymentHistory = safeReadJSON('alaePaymentHistory', samplePaymentHistory);
        if (!Array.isArray(paymentHistory)) paymentHistory = samplePaymentHistory.slice();

        // 2. AUTHENTICATION HANDLERS
        function switchAuthMode(mode) {
            const signInForm = document.getElementById('signInForm');
            const registerForm = document.getElementById('registerForm');
            const tabSignInBtn = document.getElementById('tabSignInBtn');
            const tabRegisterBtn = document.getElementById('tabRegisterBtn');
            const alertBox = document.getElementById('authAlert');

            alertBox.classList.add('hidden');

            if (mode === 'signin') {
                signInForm.classList.remove('hidden');
                registerForm.classList.add('hidden');
                tabSignInBtn.className = "flex-1 py-2 text-center border-b-2 border-navy-800 text-navy-800 font-bold transition";
                tabRegisterBtn.className = "flex-1 py-2 text-center text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition";
            } else {
                signInForm.classList.add('hidden');
                registerForm.classList.remove('hidden');
                tabRegisterBtn.className = "flex-1 py-2 text-center border-b-2 border-navy-800 text-navy-800 font-bold transition";
                tabSignInBtn.className = "flex-1 py-2 text-center text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition";
            }
        }

        function fillDemoCredentials() {
            document.getElementById('loginEmail').value = 'borrower@alae.ph';
            document.getElementById('loginPassword').value = 'pass123';
            switchAuthMode('signin');
            handleSignIn(new Event('submit'));
        }

        function getRegisteredAccounts() {
            try {
                const accounts = JSON.parse(localStorage.getItem('alaeRegisteredAccounts') || '[]');
                return Array.isArray(accounts) ? accounts : [];
            } catch (error) {
                return [];
            }
        }

        function saveRegisteredAccount(account) {
            const accounts = getRegisteredAccounts();
            const existingIndex = accounts.findIndex(a => String(a.email || '').toLowerCase() === account.email.toLowerCase());
            if (existingIndex >= 0) {
                accounts[existingIndex] = account;
            } else {
                accounts.push(account);
            }
            return safeWriteJSON('alaeRegisteredAccounts', accounts);
        }

        function handleSignIn(e) {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim().toLowerCase();
            const password = document.getElementById('loginPassword').value;
            const alertBox = document.getElementById('authAlert');

            // Demo account
            if (email === 'borrower@alae.ph' && password === 'pass123') {
                const demoUser = {
                    name: 'Juan De La Cruz',
                    email: email,
                    accountNumber: 'AL-PL-884920',
                    balance: 145200.00,
                    dueDate: 'Oct 25, 2026'
                };
                beginOtpVerification(demoUser);
                return;
            }

            // Look for an account created through the registration form
            const account = getRegisteredAccounts().find(a =>
                a.email.toLowerCase() === email && a.password === password
            );

            if (!account) {
                alertBox.className = 'mb-4 p-3 rounded-lg text-xs font-medium flex items-center gap-2 bg-red-50 text-red-700 border border-red-200';
                alertBox.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i><span>Account not found or password is incorrect.</span>';
                return;
            }

            beginOtpVerification({name:account.name, email:account.email, accountNumber:account.accountNumber, balance:account.balance || 0, dueDate:account.dueDate || '—'});
        }

        function handleRegister(e) {
            e.preventDefault();
            const name = document.getElementById('regName').value.trim();
            const email = document.getElementById('regEmail').value.trim().toLowerCase();
            const loanNo = document.getElementById('regLoanNo').value.trim() || 'AL-PL-884920';
            const password = document.getElementById('regPassword').value;

            if (password.length < 6) {
                showAuthError('Password must be at least 6 characters.');
                return;
            }

            const account = {
                name: name,
                email: email,
                password: password,
                accountNumber: loanNo,
                balance: 145200.00,
                dueDate: 'Oct 25, 2026'
            };

            if (!saveRegisteredAccount(account)) {
                showAuthError('This browser could not save the account. Check storage settings and try again.');
                return;
            }
            beginOtpVerification({name, email, accountNumber:loanNo, balance:145200.00, dueDate:'Oct 25, 2026'}, 'Account created successfully.');
        }

        function showAuthError(message) {
            const alertBox = document.getElementById('authAlert');
            alertBox.className = 'mb-4 p-3 rounded-lg text-xs font-medium flex items-center gap-2 bg-red-50 text-red-700 border border-red-200';
            alertBox.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i><span>' + message + '</span>';
        }

        function unlockPortal() {
            document.getElementById('authOverlay').classList.add('hidden');
            
            // Update UI elements with logged in user info
            document.getElementById('userDisplayName').innerText = currentUser.name;
            document.getElementById('dashWelcomeName').innerText = currentUser.name;
            document.getElementById('userDisplayAcc').innerText = currentUser.accountNumber;
            const dashAccountNo = document.getElementById('dashAccountNo');
            if (dashAccountNo) dashAccountNo.innerText = currentUser.accountNumber;
            const dashBalance = document.getElementById('dashBalance');
            if (dashBalance) dashBalance.innerText = '₱' + Number(currentUser.balance || 0).toLocaleString('en-US', {minimumFractionDigits:2});
            const dashDueDate = document.getElementById('dashDueDate');
            if (dashDueDate) dashDueDate.innerText = currentUser.dueDate || '—';
            document.getElementById('revName').innerText = currentUser.name;
            document.getElementById('rcptName').innerText = currentUser.name;
            document.getElementById('applicationName').value = currentUser.name;
            document.getElementById('applicationEmail').value = currentUser.email;
            const initials = currentUser.name.split(/\s+/).filter(Boolean).slice(0,2).map(n => n[0]).join('').toUpperCase();
            document.getElementById('userInitials').innerText = initials || 'AL';
            document.getElementById('profileInitials').innerText = initials || 'AL';
            document.getElementById('profileNameHeading').innerText = currentUser.name;
            document.getElementById('profileFullName').innerText = currentUser.name;
            document.getElementById('profileEmail').innerText = currentUser.email;
            document.getElementById('profileAccount').innerText = currentUser.accountNumber;
            document.getElementById('profileCustomerNo').innerText = currentUser.accountNumber;
            document.getElementById('lastLoginText').innerText = new Date().toLocaleString();
            renderPaymentHistory();
            renderApplicationTracker();
            startSessionTimer();
        }

        function beginOtpVerification(user, message='') {
            pendingAuthUser = user;
            pendingOtp = '123456';
            document.getElementById('demoOtpCode').innerText = pendingOtp;
            document.getElementById('otpInput').value = '';
            document.getElementById('otpModal').classList.remove('hidden');
            if (message) showToast(message + ' Verify the demo OTP to continue.', 'success');
        }

        function verifyOtp() {
            const entered = document.getElementById('otpInput').value.trim();
            if (!pendingAuthUser) { showToast('Please sign in or register again.', 'error'); return; }
            if (entered !== pendingOtp) { showToast('Invalid verification code. Please try again.', 'error'); return; }
            currentUser = pendingAuthUser;
            pendingAuthUser = null;
            document.getElementById('otpModal').classList.add('hidden');
            unlockPortal();
            showToast('Secure login verified. Welcome, ' + currentUser.name + '!', 'success');
        }

        function cancelOtp() { pendingAuthUser = null; document.getElementById('otpModal').classList.add('hidden'); }

        function startSessionTimer() {
            clearTimeout(sessionTimer);
            sessionTimer = setTimeout(() => {
                if (currentUser) { currentUser = null; document.getElementById('authOverlay').classList.remove('hidden'); showToast('Your session expired for security. Please sign in again.', 'info'); }
            }, 10 * 60 * 1000);
        }

        function resetSessionTimer() { if (currentUser) startSessionTimer(); }

        function toggleNotifications() {
            const panel = document.getElementById('notificationPanel');
            if (panel) panel.classList.toggle('hidden');
        }
        function markNotificationsRead() {
            const badge = document.getElementById('notificationBadge');
            if (badge) badge.classList.add('hidden');
            showToast('Notifications marked as read.', 'info');
        }

        function renderApplicationTracker() {
            const box = document.getElementById('applicationTracker');
            if (!box) return;
            const mine = currentUser ? applicationHistory.filter(a => a.email === currentUser.email) : [];
            if (!mine.length) {
                box.innerHTML = '<div class="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">No applications submitted yet.</div>';
                return;
            }
            box.innerHTML = mine.map(a => `
                <div class="p-4 rounded-xl border border-slate-200 bg-slate-50">
                    <div class="flex flex-wrap justify-between gap-2"><div><b class="text-sm text-navy-900">${escapeHTML(a.product)}</b><div class="text-[10px] text-slate-500 font-mono mt-1">${escapeHTML(a.reference)}</div></div><span class="px-2.5 py-1 rounded-full bg-gold-100 text-gold-800 border border-gold-200 text-[10px] font-bold">${escapeHTML(a.status)}</span></div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-[11px]"><div><span class="block text-slate-400">Requested</span><b>₱${Number(a.amount).toLocaleString('en-US',{minimumFractionDigits:2})}</b></div><div><span class="block text-slate-400">Term</span><b>${escapeHTML(a.term)}</b></div><div><span class="block text-slate-400">Submitted</span><b>${escapeHTML(a.date)}</b></div><div><span class="block text-slate-400">Purpose</span><b>${escapeHTML(a.purpose)}</b></div></div>
                    <div class="mt-4 flex gap-1">${['Submitted','Under Review','Documents Required','Approved'].map((x,i)=>`<div class="h-1.5 flex-1 rounded-full ${i <= 1 ? 'bg-gold-500' : 'bg-slate-200'}" title="${x}"></div>`).join('')}</div>
                </div>`).join('');
        }

        function downloadStatement() {
            if (!currentUser) { showToast('Please sign in to view your statement.', 'error'); return; }
            const rows = paymentHistory.filter(x => x.account === currentUser.accountNumber || x.account === 'AL-PL-884920' || x.account === 'AL-VH-304912');
            const w = window.open('', '_blank');
            if (!w) { showToast('Your browser blocked the statement window. Allow pop-ups and try again.', 'error'); return; }
            const rowHTML = rows.map(x => `<tr><td>${escapeHTML(x.ref)}</td><td>${escapeHTML(x.date)}</td><td>${escapeHTML(x.account)}</td><td>${escapeHTML(x.method)}</td><td>₱${Number(x.amount).toLocaleString('en-US',{minimumFractionDigits:2})}</td><td>${escapeHTML(x.status)}</td></tr>`).join('');
            w.document.write(`<!DOCTYPE html><html><head><title>ALAE Bank Statement</title><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;padding:30px;color:#0e1f38}h1{margin:0 0 4px;color:#0e1f38} .gold{color:#b88e3d}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left;font-size:12px}th{background:#f7f3e9} @media print{button{display:none}}</style></head><body><h1>ALAE BANK</h1><div class="gold">Electronic Payment Statement</div><p><b>Customer:</b> ${escapeHTML(currentUser.name)}<br><b>Account:</b> ${escapeHTML(currentUser.accountNumber)}<br><b>Generated:</b> ${new Date().toLocaleString()}</p><table><thead><tr><th>Reference</th><th>Date</th><th>Account</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead><tbody>${rowHTML || '<tr><td colspan="6">No payments recorded.</td></tr>'}</tbody></table><p style="margin-top:30px;font-size:12px;color:#666">Demonstration statement generated by the ALAE Bank portal prototype.</p></body></html>`);
            w.document.close();
            setTimeout(() => { w.focus(); w.print(); }, 300);
        }

        function printOfficialReceipt() {
            const receipt = document.getElementById('printableReceipt');
            if (!receipt) { showToast('The receipt could not be found.', 'error'); return; }
            const w = window.open('', '_blank');
            if (!w) {
                showToast('Your browser blocked the print window. Allow pop-ups and try again.', 'error');
                return;
            }
            const clone = receipt.cloneNode(true);
            clone.removeAttribute('id');
            clone.style.display = 'block';
            clone.style.position = 'relative';
            clone.style.visibility = 'visible';
            clone.style.boxShadow = 'none';
            clone.style.margin = '0 auto';
            clone.style.maxWidth = '800px';
            clone.querySelectorAll('img').forEach(img => { img.src = new URL(img.getAttribute('src'), window.location.href).href; });
            const styles = `body{font-family:Arial,sans-serif;color:#0e1f38;margin:0;padding:24px;background:#fff} .receipt-logo{display:block;width:170px;height:auto;object-fit:contain;margin:0 auto 12px} .text-center{text-align:center}.pb-6{padding-bottom:24px}.border-b-2{border-bottom:2px solid #0e1f38}.border-gold-500{border-color:#b88e3d}.border-2{border:2px solid #b88e3d}.p-8{padding:28px}.rounded-2xl{border-radius:12px}.text-xs{font-size:12px}.text-sm{font-size:14px}.text-base{font-size:16px}.font-bold{font-weight:700}.font-mono{font-family:monospace}.text-slate-500{color:#64748b}.text-slate-600{color:#475569}.text-slate-800{color:#1e293b}.text-navy-900{color:#0e1f38}.text-emerald-700{color:#047857}.bg-emerald-100{background:#d1fae5}.text-emerald-800{color:#065f46}.border-emerald-300{border-color:#6ee7b7}.rounded-full{border-radius:999px}.px-4{padding-left:16px;padding-right:16px}.py-1{padding-top:4px;padding-bottom:4px}.mt-1{margin-top:4px}.mt-3{margin-top:12px}.py-6{padding-top:24px;padding-bottom:24px}.space-y-3>*+*{margin-top:12px}.space-y-2>*+*{margin-top:8px}.pt-4{padding-top:16px}.pt-2{padding-top:8px}.border-t{border-top:1px solid #e2e8f0}.border-slate-200{border-color:#e2e8f0}.border-slate-300{border-color:#cbd5e1}.flex{display:flex}.justify-between{justify-content:space-between}.items-center{align-items:center}.text-right{text-align:right}.relative{position:relative}.overflow-hidden{overflow:hidden}.opacity-5{opacity:.05}.text-9xl{font-size:70px} .receipt-brand-header .text-xs{line-height:1.5} @page{size:auto;margin:12mm} @media print{body{padding:0}.no-print{display:none!important}}`;
            w.document.open();
            w.document.write(`<!DOCTYPE html><html><head><title>ALAE Bank Official Payment Receipt</title><meta charset="utf-8"><style>${styles}</style></head><body>${clone.outerHTML}<script>window.addEventListener('load',()=>setTimeout(()=>{window.focus();window.print();},250));<\/script></body></html>`);
            w.document.close();
        }

        function handleLogout() {
            currentUser = null;
            pendingAuthUser = null;
            clearTimeout(sessionTimer);
            document.getElementById('authOverlay').classList.remove('hidden');
            document.getElementById('loginEmail').value = '';
            document.getElementById('loginPassword').value = '';
            document.getElementById('otpModal').classList.add('hidden');
            toggleSidebar(false);
            showToast('Logged out securely.', 'info');
        }

        // Opens the application form directly from a specific loan product.
        function applyForProduct(product) {
            if (!currentUser) {
                showToast('Please sign in before applying for a loan.', 'info');
                return;
            }
            switchTab('apply');
            const productField = document.getElementById('applicationProduct');
            if (productField) {
                productField.value = product;
                productField.dispatchEvent(new Event('change'));
            }
            const heading = document.getElementById('applicationProductHeading');
            if (heading) heading.innerText = product + ' Application';
            const purpose = document.getElementById('applicationPurpose');
            if (purpose && !purpose.value) {
                const defaults = {
                    'Personal Loan': 'Personal, family, education, medical, or emergency needs',
                    'Vehicle': 'Purchase of an eligible new or pre-owned vehicle',
                    'Mortgage': 'Home purchase, construction, or residential financing',
                    'Real Estate Loan': 'Property acquisition, construction, or improvement'
                };
                purpose.placeholder = defaults[product] || 'Purpose of the loan';
            }
            setTimeout(() => {
                const form = document.getElementById('loanApplicationForm');
                if (form) form.scrollIntoView({behavior:'smooth', block:'start'});
            }, 80);
        }

        function submitLoanApplication(e) {
            e.preventDefault();
            if (!currentUser) { showToast('Please sign in before submitting an application.', 'error'); return; }

            const product = document.getElementById('applicationProduct').value;
            const amount = parseFloat(document.getElementById('applicationAmount').value) || 0;
            const term = document.getElementById('applicationTerm').value;
            const purpose = document.getElementById('applicationPurpose').value.trim();

            if (!product || amount < 1000 || !Number.isFinite(amount) || !term || !purpose) {
                showToast('Please complete all application fields.', 'error');
                return;
            }

            const reference = 'ALAE-APP-' + Date.now().toString().slice(-8);
            applicationHistory.unshift({reference, name:currentUser.name, email:currentUser.email, product, amount, term, purpose, status:'Under Review', date:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})});
            if (!safeWriteJSON('alaeLoanApplications', applicationHistory)) {
                applicationHistory.shift();
                showToast('Application could not be saved in this browser. Check storage settings.', 'error');
                return;
            }
            renderApplicationTracker();
            showToast('Application ' + reference + ' submitted successfully and is now under review.', 'success');

            document.getElementById('loanApplicationForm').reset();
            document.getElementById('applicationName').value = currentUser.name;
            document.getElementById('applicationEmail').value = currentUser.email;
        }

        document.addEventListener('DOMContentLoaded', () => {
            const productField = document.getElementById('applicationProduct');
            const hint = document.getElementById('applicationProductHint');
            if (productField && hint) {
                productField.addEventListener('change', () => {
                    hint.innerText = productField.value ? 'You are applying for: ' + productField.value : 'Select a financing product to begin your application.';
                });
            }
        });

        // 3. NAVIGATION TABS
        function switchTab(tabName) {
            const views = ['dashboard', 'pay', 'products', 'apply', 'history', 'profile', 'faq'];
            if (!views.includes(tabName)) return;
            views.forEach(v => {
                const el = document.getElementById('view-' + v);
                if (el) el.classList.toggle('hidden', v !== tabName);
            });
            document.querySelectorAll('[data-nav-tab]').forEach(btn => {
                const isActive = btn.getAttribute('data-nav-tab') === tabName;
                btn.classList.toggle('active', isActive);
                btn.classList.toggle('is-active', isActive);
                if (isActive) btn.setAttribute('aria-current', 'page');
                else btn.removeAttribute('aria-current');
            });
            const notificationPanel = document.getElementById('notificationPanel');
            if (notificationPanel) notificationPanel.classList.add('hidden');
            toggleSidebar(false);
            if (tabName === 'history') renderPaymentHistory();
            if (tabName === 'apply') renderApplicationTracker();
            if (tabName === 'pay') goToStep(1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function toggleSidebar(forceState) {
            const sidebar = document.getElementById('appSidebar');
            const scrim = document.getElementById('mobileSidebarScrim');
            const toggle = document.getElementById('sidebarToggle');
            if (!sidebar) return;
            const shouldOpen = typeof forceState === 'boolean' ? forceState : !sidebar.classList.contains('is-open');
            sidebar.classList.toggle('is-open', shouldOpen);
            if (scrim) scrim.classList.toggle('is-visible', shouldOpen);
            document.body.classList.toggle('sidebar-open', shouldOpen);
            if (toggle) toggle.setAttribute('aria-expanded', String(shouldOpen));
        }

        // 4. MULTI-STEP PAYMENT CONSOLE WIZARD
        function updatePayAccountDetails() {
            const select = document.getElementById('payAccountSelect');
            const customDiv = document.getElementById('customAccountInputDiv');
            const amtInput = document.getElementById('payAmountInput');

            if (select.value === 'CUSTOM') {
                customDiv.classList.remove('hidden');
            } else {
                customDiv.classList.add('hidden');
                const scheduledAmounts = {
                    'AL-PL-884920': 8750,
                    'AL-VH-304912': 3200,
                    'AL-MG-100492': 22000,
                    'AL-RE-100492': 25000
                };
                if (Object.prototype.hasOwnProperty.call(scheduledAmounts, select.value)) {
                    amtInput.value = scheduledAmounts[select.value];
                }
            }
            calculateBreakdown();
        }

        function setPayAmount(val) {
            document.getElementById('payAmountInput').value = val;
            calculateBreakdown();
        }

        // E-wallet and card gateways use the prototype's ₱15 fee; branch OTC has no convenience fee.
        function getPaymentFee() {
            return activePaymentMethod === 'branch' ? 0 : 15;
        }

        function calculateBreakdown() {
            const baseVal = parseFloat(document.getElementById('payAmountInput').value) || 0;
            const fee = getPaymentFee();
            const total = baseVal + fee;

            document.getElementById('summaryBaseAmount').innerText = '₱' + baseVal.toLocaleString('en-US', {minimumFractionDigits: 2});
            document.getElementById('summaryFee').innerText = '₱' + fee.toFixed(2);
            document.getElementById('summaryTotalAmount').innerText = '₱' + total.toLocaleString('en-US', {minimumFractionDigits: 2});
        }

        function selectMethod(method) {
            const methods = ['ewallet', 'card', 'branch'];
            if (!methods.includes(method)) return;
            activePaymentMethod = method;

            methods.forEach(m => {
                const card = document.getElementById('method-card-' + m);
                const fields = document.getElementById('method-fields-' + m);
                if (!card || !fields) return;

                if (m === method) {
                    card.classList.add('border-gold-500', 'bg-gold-50/20');
                    card.classList.remove('border-transparent');
                    card.setAttribute('aria-pressed', 'true');
                    fields.classList.remove('hidden');
                } else {
                    card.classList.remove('border-gold-500', 'bg-gold-50/20');
                    card.setAttribute('aria-pressed', 'false');
                    fields.classList.add('hidden');
                }
            });
            calculateBreakdown();
        }

        function goToStep(stepNumber) {
            if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 4) return;

            // Validate before moving forward, but always allow the borrower to go back.
            if (stepNumber > currentStep && (stepNumber === 2 || stepNumber === 3)) {
                const selected = document.getElementById('payAccountSelect').value;
                const accountNumber = selected === 'CUSTOM' ? document.getElementById('customAccountInput').value.trim() : selected;
                const amount = Number.parseFloat(document.getElementById('payAmountInput').value);
                if (!accountNumber) {
                    showToast('Enter the loan account number before continuing.', 'error');
                    document.getElementById('customAccountInput').focus();
                    return;
                }
                if (!Number.isFinite(amount) || amount < 100) {
                    showToast('Enter a payment amount of at least ₱100.00.', 'error');
                    document.getElementById('payAmountInput').focus();
                    return;
                }
            }
            if (stepNumber > currentStep && stepNumber === 3) {
                if (activePaymentMethod === 'ewallet') {
                    const digits = document.getElementById('ewalletPhone').value.replace(/\D/g, '');
                    if (digits.length < 10 || digits.length > 13) {
                        showToast('Enter a valid e-wallet mobile number.', 'error');
                        return;
                    }
                }
                if (activePaymentMethod === 'card') {
                    const cardDigits = document.getElementById('cardNumber').value.replace(/\D/g, '');
                    const cvvDigits = document.getElementById('cardCvv').value.replace(/\D/g, '');
                    if (cardDigits.length < 13 || cardDigits.length > 19 || !/^\d{2}\/\d{2}$/.test(document.getElementById('cardExpiry').value.trim()) || cvvDigits.length < 3 || cvvDigits.length > 4) {
                        showToast('Check the demo card number, expiry date, and security code.', 'error');
                        return;
                    }
                }
            }

            currentStep = stepNumber;
            
            // Hide all steps
            for (let i = 1; i <= 4; i++) {
                document.getElementById('payment-step-' + i).classList.add('hidden');
                
                // Update indicator styling
                const ind = document.getElementById('step-ind-' + i);
                if (i <= stepNumber) {
                    ind.className = "flex items-center gap-2 font-bold text-xs text-navy-800";
                    ind.querySelector('span:first-child').className = "w-6 h-6 rounded-full bg-navy-800 text-white flex items-center justify-center text-xs";
                } else {
                    ind.className = "flex items-center gap-2 text-xs text-slate-400 font-semibold";
                    ind.querySelector('span:first-child').className = "w-6 h-6 rounded-full bg-slate-300 text-slate-600 flex items-center justify-center text-xs";
                }
            }

            // Show target step
            document.getElementById('payment-step-' + stepNumber).classList.remove('hidden');

            // Populate Step 3 Review Data
            if (stepNumber === 3) {
                const targetAccSelect = document.getElementById('payAccountSelect').value;
                const accNo = targetAccSelect === 'CUSTOM' ? document.getElementById('customAccountInput').value : targetAccSelect;
                const baseVal = parseFloat(document.getElementById('payAmountInput').value) || 0;
                const fee = getPaymentFee();
                const total = baseVal + fee;

                let channelName = "E-Wallet";
                if (activePaymentMethod === 'ewallet') {
                    channelName = document.getElementById('ewalletProvider').value + ' (' + document.getElementById('ewalletPhone').value + ')';
                } else if (activePaymentMethod === 'card') {
                    channelName = 'Debit/Credit Card (' + document.getElementById('cardNumber').value.slice(-4) + ')';
                } else {
                    channelName = 'Batangas Branch OTC Teller';
                }

                document.getElementById('revAccount').innerText = accNo;
                document.getElementById('revChannel').innerText = channelName;
                document.getElementById('revPrincipal').innerText = '₱' + baseVal.toLocaleString('en-US', {minimumFractionDigits: 2});
                document.getElementById('revFee').innerText = '₱' + fee.toLocaleString('en-US', {minimumFractionDigits: 2});
                document.getElementById('revTotal').innerText = '₱' + total.toLocaleString('en-US', {minimumFractionDigits: 2});
            }
        }

        function processFinalPayment() {
            if (!currentUser) { showToast('Please sign in before making a payment.', 'error'); return; }
            const authCheck = document.getElementById('authCheck');
            const amountInput = document.getElementById('payAmountInput');
            const selectedAccount = document.getElementById('payAccountSelect').value;
            const accountNumber = selectedAccount === 'CUSTOM' ? document.getElementById('customAccountInput').value.trim() : selectedAccount;
            const baseVal = Number.parseFloat(amountInput.value);
            if (!accountNumber) { showToast('Enter the loan account number before continuing.', 'error'); goToStep(1); return; }
            if (!Number.isFinite(baseVal) || baseVal < 100) { showToast('Enter a payment amount of at least ₱100.00.', 'error'); goToStep(1); amountInput.focus(); return; }
            if (activePaymentMethod === 'ewallet') {
                const digits = document.getElementById('ewalletPhone').value.replace(/\D/g, '');
                if (digits.length < 10 || digits.length > 13) { showToast('Enter a valid e-wallet mobile number.', 'error'); goToStep(2); return; }
            }
            if (activePaymentMethod === 'card') {
                const cardDigits = document.getElementById('cardNumber').value.replace(/\D/g, '');
                const cvvDigits = document.getElementById('cardCvv').value.replace(/\D/g, '');
                if (cardDigits.length < 13 || cardDigits.length > 19 || !/^\d{2}\/\d{2}$/.test(document.getElementById('cardExpiry').value.trim()) || cvvDigits.length < 3 || cvvDigits.length > 4) {
                    showToast('Check the demo card number, expiry date, and security code.', 'error'); goToStep(2); return;
                }
            }
            if (!authCheck.checked) { showToast('Please authorize the payment declaration checkbox.', 'error'); return; }

            const paySubmitBtn = document.getElementById('paySubmitBtn');
            const originalButtonHTML = paySubmitBtn.innerHTML;
            paySubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i> Processing Payment...';
            paySubmitBtn.disabled = true;

            setTimeout(() => {
                const randomRef = '#ALAE-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000);
                const now = new Date();
                const timeString = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' • ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const accNo = accountNumber;
                const fee = getPaymentFee();
                const total = baseVal + fee;
                let channelStr = 'Branch OTC';
                if (activePaymentMethod === 'ewallet') channelStr = document.getElementById('ewalletProvider').value + ' E-Wallet';
                else if (activePaymentMethod === 'card') channelStr = 'Debit/Credit Card';

                document.getElementById('rcptRef').innerText = randomRef;
                document.getElementById('rcptDate').innerText = timeString;
                document.getElementById('rcptAccount').innerText = accNo;
                document.getElementById('rcptMethod').innerText = channelStr;
                document.getElementById('rcptName').innerText = currentUser.name;
                document.getElementById('rcptPrincipal').innerText = '₱' + baseVal.toLocaleString('en-US', {minimumFractionDigits:2});
                document.getElementById('rcptFee').innerText = '₱' + fee.toLocaleString('en-US', {minimumFractionDigits:2});
                document.getElementById('rcptTotal').innerText = '₱' + total.toLocaleString('en-US', {minimumFractionDigits:2});

                const loanTypes = {'AL-PL-884920':'Personal Loan','AL-VH-304912':'Vehicle','AL-MG-100492':'Mortgage','AL-RE-100492':'Real Estate Loan'};
                const loanType = loanTypes[accNo] || 'Loan Payment';
                paymentHistory.unshift({ref:randomRef, date:timeString, account:accNo, loanType, method:channelStr, amount:baseVal, fee, total, status:'SUCCESS'});
                const historySaved = safeWriteJSON('alaePaymentHistory', paymentHistory);

                if (currentUser && accNo === currentUser.accountNumber) {
                    currentUser.balance = Math.max(0, Number(currentUser.balance || 0) - baseVal);
                    document.getElementById('dashBalance').innerText = '₱' + currentUser.balance.toLocaleString('en-US',{minimumFractionDigits:2});
                    const accounts = getRegisteredAccounts();
                    const savedIndex = accounts.findIndex(a => a.email && a.email.toLowerCase() === currentUser.email.toLowerCase());
                    if (savedIndex >= 0) { accounts[savedIndex].balance = currentUser.balance; safeWriteJSON('alaeRegisteredAccounts', accounts); }
                }
                renderPaymentHistory();
                paySubmitBtn.innerHTML = originalButtonHTML;
                paySubmitBtn.disabled = false;
                goToStep(4);
                showToast(historySaved ? 'Payment simulated successfully. No real transaction was sent.' : 'Payment was simulated, but this browser could not save the history.', historySaved ? 'success' : 'error');
            }, 650);
        }

        function resetPaymentWizard() {
            document.getElementById('authCheck').checked = false;
            goToStep(1);
        }

        function quickPay(accNo, amount) {
            switchTab('pay');
            const select = document.getElementById('payAccountSelect');
            const knownAccounts = ['AL-PL-884920', 'AL-VH-304912', 'AL-MG-100492', 'AL-RE-100492'];
            if (knownAccounts.includes(accNo)) {
                select.value = accNo;
            } else {
                select.value = 'CUSTOM';
                document.getElementById('customAccountInput').value = accNo;
            }
            document.getElementById('payAmountInput').value = amount;
            updatePayAccountDetails();
            goToStep(1);
        }

        // 5. RENDER LOGS
        function renderPaymentHistory(filterType = 'ALL') {
            const tbody = document.getElementById('paymentHistoryTableBody');
            if (tbody) {
                tbody.innerHTML = '';
                const filtered = filterType === 'ALL' ? paymentHistory : paymentHistory.filter(item => item.loanType === filterType);
                if (filtered.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-400 text-xs">No transaction records found.</td></tr>';
                } else {
                    filtered.forEach(item => {
                        const tr = document.createElement('tr');
                        tr.className = 'hover:bg-slate-50 transition';
                        tr.innerHTML = `
                            <td class="p-3 font-mono font-bold text-navy-900">${escapeHTML(item.ref)}</td>
                            <td class="p-3 text-slate-600">${escapeHTML(item.date)}</td>
                            <td class="p-3 font-mono text-slate-800">${escapeHTML(item.account)}</td>
                            <td class="p-3 font-medium text-slate-700">${escapeHTML(item.method)}</td>
                            <td class="p-3 font-mono font-bold text-slate-900 text-right">₱${Number(item.amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            <td class="p-3 text-center"><span class="payment-status-badge">${escapeHTML(item.status)}</span></td>
                            <td class="p-3 text-center"><button type="button" onclick="viewPaymentReceipt(${paymentHistory.findIndex(entry => entry.ref === item.ref)})" class="text-gold-600 hover:text-gold-700 font-bold text-xs"><i class="fa-solid fa-receipt mr-1"></i> View</button></td>`;
                        tbody.appendChild(tr);
                    });
                }
            }
            renderDashboardRecentPayments();
        }

        function renderDashboardRecentPayments() {
            const box = document.getElementById('dashboardRecentPayments');
            if (!box) return;
            const recent = paymentHistory.slice(0, 3);
            if (!recent.length) {
                box.innerHTML = '<div class="recent-empty">No payments recorded yet. Your successful payments will appear here.</div>';
                return;
            }
            box.innerHTML = recent.map(item => `
                <div class="recent-payment-row">
                    <span class="recent-payment-icon"><i class="fa-solid fa-check"></i></span>
                    <span class="recent-payment-details"><strong>${escapeHTML(item.loanType || 'Loan Payment')}</strong><small>${escapeHTML(item.date)} · ${escapeHTML(item.account)}</small></span>
                    <span class="recent-payment-amount">₱${Number(item.amount).toLocaleString('en-US',{minimumFractionDigits:2})}</span>
                </div>`).join('');
        }


        function viewPaymentReceipt(index) {
            const item = paymentHistory[index];
            if (!item) {
                showToast('That payment record could not be found.', 'error');
                return;
            }
            const method = String(item.method || 'Loan Payment');
            const fee = item.fee !== undefined ? Number(item.fee) : (/branch|otc/i.test(method) ? 0 : 15);
            const principal = Number(item.amount) || 0;
            const total = item.total !== undefined ? Number(item.total) : principal + fee;
            const fields = {
                rcptRef: item.ref || '—',
                rcptDate: item.date || '—',
                rcptAccount: item.account || '—',
                rcptName: currentUser ? currentUser.name : 'Borrower',
                rcptMethod: method,
                rcptPrincipal: '₱' + principal.toLocaleString('en-US', {minimumFractionDigits: 2}),
                rcptFee: '₱' + fee.toLocaleString('en-US', {minimumFractionDigits: 2}),
                rcptTotal: '₱' + total.toLocaleString('en-US', {minimumFractionDigits: 2})
            };
            Object.entries(fields).forEach(([id, value]) => {
                const node = document.getElementById(id);
                if (node) node.innerText = value;
            });
            switchTab('pay');
            goToStep(4);
            showToast('Payment receipt loaded. You can print it now.', 'success');
        }

        function filterLogs(type) {
            renderPaymentHistory(type);
        }

        // 6. TOAST MESSAGES
        function showToast(msg, type = 'success') {
            const toast = document.getElementById('toast');
            const toastMsg = document.getElementById('toastMsg');
            const toastIcon = document.getElementById('toastIcon');

            toastMsg.innerText = msg;

            if (type === 'error') {
                toastIcon.className = "fa-solid fa-circle-exclamation text-rose-400 text-base";
            } else if (type === 'info') {
                toastIcon.className = "fa-solid fa-circle-info text-blue-400 text-base";
            } else {
                toastIcon.className = "fa-solid fa-circle-check text-emerald-400 text-base";
            }

            toast.classList.remove('translate-y-20', 'opacity-0');

            setTimeout(() => {
                toast.classList.add('translate-y-20', 'opacity-0');
            }, 3000);
        }

        // Initializer
        document.addEventListener('DOMContentLoaded', function() {
            calculateBreakdown();
            renderApplicationTracker();
            renderPaymentHistory();
            switchTab('dashboard');
            ['click','keydown','mousemove','touchstart'].forEach(evt => document.addEventListener(evt, resetSessionTimer, {passive:true}));
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape') { toggleSidebar(false); const panel=document.getElementById('notificationPanel'); if(panel) panel.classList.add('hidden'); }
            });
        });
