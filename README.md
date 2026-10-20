![Openfront Gym](https://openship.org/og/openfront-gym.png)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fopenshiporg%2Fopenfront-gym&env=DATABASE_URL%2CSESSION_SECRET%2CNEXTAUTH_URL%2CS3_BUCKET_NAME%2CS3_REGION%2CS3_ENDPOINT%2CS3_ACCESS_KEY_ID%2CS3_SECRET_ACCESS_KEY)

Openfront Gym is a self-hostable platform for gyms and fitness studios. It combines a public membership and class-booking site with member accounts and a staff dashboard for schedules, rosters, check-in, billing, personal training, retail sales, and facility operations.

## Demo

<a href="https://kinetic.openship.org"><img src="public/images/training-floor.jpg" alt="Training floor image used by the Gym storefront" width="600"></a>

Kinetic Performance Club

| | |
|---|---|
| **Storefront** | [kinetic.openship.org](https://kinetic.openship.org) |
| **Dashboard** | [kinetic.openship.org/dashboard](https://kinetic.openship.org/dashboard) |
| **User** | `kinetic@openship.org` |
| **Password** | `TKMZFA2uDt2WRtvmwRyK` |

[Learn more →](https://openship.org/products/openfront-gym)

[Documentation →](https://docs.openship.org/docs/openfront/gym/)

## The Openfront Ecosystem

Openfront is part of an ecosystem of open-source commerce tools:

- **[Openfront E-commerce](https://github.com/openshiporg/openfront)**: Headless e-commerce for retail.
- **[Openfront Restaurant](https://github.com/openshiporg/openfront-restaurant)**: Restaurant ordering, point of sale, and kitchen operations.
- **[Openship](https://github.com/openshiporg/openship)**: Order routing for multi-channel fulfillment.
- **Openfront Gym**: (This repository) Membership, class, and gym operations.

## Core Features

### Admin Dashboard
Manage members, membership plans, class catalogs, instructors, locations, schedules, rosters, and billing. Staff work from dedicated check-in, training, retail, import, operations, and reporting screens.

### Storefront
Visitors can browse memberships, classes, schedules, instructors, facilities, and club policies. Members can review bookings, membership details, profile information, participation terms, and training in their account.

### Memberships & Billing
Membership tiers, subscriptions, payment records, and class-credit ledgers support membership administration. The Stripe integration includes membership checkout, billing-portal access, subscription changes, refunds, and signed payment webhooks. New Stripe charges and email delivery require their respective configuration.

### Classes, Check-In & Training
- Class types, recurring schedules, individual sessions, capacity checks, bookings, cancellations, and waitlists.
- Staff rosters and attendance records.
- Member QR codes, front-desk check-in, and a staff-unlocked kiosk.
- Trainer availability, appointments, coaching assignments, workout logs, and training-credit records.
- Staff-managed training packages issued from recorded settled purchases or verified counter card payments.

### Retail & Facility Operations
Record retail sales, returns, stock entries, and drawer closes. Manage locations, resources, operational notices, and participation policies alongside member operations.

## Architecture

### Technology Stack
- **Frontend**: Next.js 16 with App Router and React 19.
- **Backend**: KeystoneJS 6 with a GraphQL API.
- **Database**: PostgreSQL with Prisma ORM.
- **Styling**: Tailwind CSS 4 with shared shadcn/ui components.
- **Authentication**: Session-based with role-based permissions.

### Application Structure
```text
openfront-gym/
├── app/                    # Public, member, staff, kiosk, and API routes
├── features/
│   ├── keystone/           # Models, access rules, queries, and business commands
│   ├── platform/           # Staff workspaces and onboarding
│   ├── storefront/         # Public site and member-facing screens
│   ├── member/             # Member profile and check-in code components
│   ├── kiosk/              # Kiosk interface
│   └── integrations/       # Membership and payment adapters
└── components/             # Shared UI components
```

### Data Models
The [Keystone model registry](features/keystone/models/index.ts) and [Prisma schema](schema.prisma) cover:

- Organizations, users, roles, locations, resources, and gym settings.
- Members, membership tiers, memberships, subscriptions, and membership credits.
- Class types, schedules, instances, bookings, waitlists, and attendance.
- Instructors, trainer availability, appointments, training packages, and training credits.
- Exercises, workout logs, workout sets, and coaching assignments.
- Payments, payment sessions, payment events, billing attempts, and refund attempts.
- Check-ins, participation evidence, operational notices, and retail sales, returns, and stock.

## Getting Started

### Prerequisites
- Node.js 20.9 or later, compatible with Next.js 16.
- A PostgreSQL database you can migrate.
- npm.

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/openshiporg/openfront-gym.git
   cd openfront-gym
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp env.example .env
   ```

   Update `.env` with your database and newly generated secrets:
   ```env
   DATABASE_URL=postgresql://user:password@host/database
   SESSION_SECRET=replace-with-a-new-random-value-of-at-least-32-characters
   QR_CODE_SECRET=replace-with-a-separate-random-value-of-at-least-32-characters
   STRIPE_ENABLED=false
   MAIL_ENABLED=false
   PUBLIC_SIGNUPS_ALLOWED=false
   PUBLIC_MEMBER_SIGNUPS_ALLOWED=false
   PAYMENT_TEST_MODE=false
   KIOSK_API_TOKEN=
   KIOSK_ORGANIZATION_ID=
   ```

   Generate each secret separately, for example with `openssl rand -hex 32`. Do not use the placeholder text as a secret.

   Set `NEXTAUTH_URL` to your application origin when using payment returns or mail links. Leave kiosk credentials blank unless configuring a kiosk. For multiple organizations or public member signup, configure `STOREFRONT_ORGANIZATION_ID`; member signup also needs the matching `PUBLIC_MEMBER_SIGNUP_ORGANIZATION_ID`. Production requires the complete S3 configuration in `env.example`. QR codes require `QR_CODE_SECRET`; Stripe and mail remain unavailable until configured.

   Replace URL examples and internal routing overrides with your actual application origin, or remove optional overrides you do not need. Never commit your `.env` file.

3. **Start development server:**
   ```bash
   npm run dev
   ```

   This builds Keystone, applies checked-in database migrations, and starts Next.js.

4. **Access the application:**
   Open the URL `npm run dev` prints, then use these paths:

   - **Storefront**: `/`
   - **Staff dashboard**: `/dashboard`
   - **Member account**: `/account`
   - **Kiosk**: `/kiosk/check-in`, after configuration and staff unlock
   - **GraphQL API**: `/api/graphql`

5. **Create your first admin user:**
   Visit `/dashboard/init` on that application URL to create the initial administrator.

6. **Run gym onboarding:**
   Use dashboard onboarding to configure the gym, locations, membership tiers, instructors, and classes. Review the resulting schedules and storefront settings before enabling member signup.

## Development Commands

- `npm run dev` - Build Keystone, apply migrations, and start Next.js development.
- `npm run build` - Build Keystone and Next.js for production; does not apply migrations.
- `npm start` - Start the production Next.js server.
- `npm run migrate:gen` - Build Keystone, generate view ordering, and generate/apply development migrations.
- `npm run migrate` - Apply checked-in Prisma migrations.
- `npm run lint` - Run the configured application ESLint checks.
- `npm run typecheck` - Check TypeScript without emitting files.
- `npm run test:offline` - Run the Node test suite in `tests/*.test.ts`.

Use a development database for `migrate:gen`; it generates and applies schema changes.

### Payment Integration
Membership checkout and Stripe adapters live in [`features/integrations/payment/`](features/integrations/payment). Configure Stripe using [`env.example`](env.example) and payment-provider settings. Stripe webhooks enter at `/api/stripe/webhook`. Personal-training package sales are staff-managed, not a public package-shopping checkout.

### Check-In Integration
The [kiosk API](app/api/kiosk) uses a configured organization and kiosk credential. Member QR codes and [check-in commands](features/keystone/queries/checkIn.ts) are separate from payment processing.

## Documentation

See the [Openfront Gym documentation](https://docs.openship.org/docs/openfront/gym/) for the vertical's application guide, data model, access boundaries, and integration notes. The [source models](features/keystone/models) and [business commands](features/keystone/mutations) describe the implementation in this repository.

## Security & Permissions

### Role-Based Access Control
- `canAccessDashboard` - Staff dashboard access.
- `canManagePeople` - Member accounts and invitations.
- `canManageAppointments` - Personal training, packages, and availability.
- `canManageCheckIns` - Front-desk check-in and checkout.
- `canManageRetail` - Retail sales, returns, stock, and closes.
- `canViewReports` - Operational reporting.
- `isInstructor` - Instructor-specific rosters and coaching access.

### Security Features
- Session-based authentication and organization-scoped access rules.
- Member ownership checks on account and booking operations.
- Tenant relationship validation and controlled class-capacity commands.
- Rotating member QR codes and a separate staff-unlocked kiosk session.
- Stripe webhook signature verification.

## Platform Components

### Admin Platform (`/dashboard`)
- **Members & plans**: Member records, imports, membership tiers, and billing.
- **Scheduling & rosters**: Class catalog, schedules, instructors, and attendance.
- **Check-in**: Front-desk member access and check-out.
- **Training**: Appointments, packages, credits, and coaching.
- **Retail & operations**: Sales, returns, facilities, policies, and notices.
- **Reports & settings**: Operational reports, locations, and storefront configuration.

### Storefront Experience
- **Discovery**: Classes, schedules, memberships, instructors, and facilities.
- **Joining**: Membership signup and configured Stripe checkout.
- **Member account**: Bookings, membership, profile, participation terms, and training.
- **Check-in**: Member code and kiosk surfaces.

## Deployment

### Production Deployment
The Vercel button imports this repository. Provision PostgreSQL and configure the environment, storage, and any enabled integrations separately.

Build the application, apply migrations as a release step, and start the production server:

```bash
npm run build
npm run migrate
npm start
```

Back up an existing database before applying migrations. The included [`railway.toml`](railway.toml) builds without migrations and applies them when the application starts.

### Scaling Considerations
Class capacity, credits, and check-in state are coordinated through PostgreSQL. Keep organization binding and kiosk credentials consistent across application instances, and use shared object storage for uploads.

## Contributing

Use the development commands above when preparing changes. Keep model changes and their migrations together, and describe any workflow or permission changes in your pull request.

## License

No top-level license file or package license declaration is included in this repository.

## Support

- **Documentation**: [Openfront Gym guide](https://docs.openship.org/docs/openfront/gym/).
- **Issues**: [Report bugs and feature requests](https://github.com/openshiporg/openfront-gym/issues).
- **Product**: [Learn more about Openfront Gym](https://openship.org/products/openfront-gym).

---

Built with [Next.js](https://nextjs.org) and [KeystoneJS](https://keystonejs.com).
