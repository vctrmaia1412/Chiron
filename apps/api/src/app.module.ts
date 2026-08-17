import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { DatabaseService } from './database/database.service';
import { CryptoService } from './common/crypto.service';
import { AuditService } from './common/audit.service';
import { MailerService } from './common/mailer.service';
import { AllExceptionsFilter } from './common/exception.filter';
import { AuthorizationGuard } from './auth/authorization.guard';
import { SessionService } from './auth/session.service';
import { HealthController } from './modules/health/health.controller';
import { IdentityController } from './modules/identity/identity.controller';
import { IdentityService } from './modules/identity/identity.service';
import { MembersController } from './modules/identity/members.controller';
import { MembersService } from './modules/identity/members.service';
import { TenantController } from './modules/tenant/tenant.controller';
import { TenantService } from './modules/tenant/tenant.service';
import { ProvisioningService } from './modules/tenant/provisioning.service';
import { CatalogController } from './modules/registry/catalog.controller';
import { CatalogService } from './modules/registry/catalog.service';
import { GuardiansController } from './modules/registry/guardians.controller';
import { GuardiansService } from './modules/registry/guardians.service';
import { PatientsController } from './modules/registry/patients.controller';
import { PatientsService } from './modules/registry/patients.service';
import { AppointmentsController } from './modules/scheduling/appointments.controller';
import { AppointmentsService } from './modules/scheduling/appointments.service';
import { EncountersController } from './modules/clinical/encounters.controller';
import { EncountersService } from './modules/clinical/encounters.service';
import { PrescriptionsController } from './modules/clinical/prescriptions.controller';
import { PrescriptionsService } from './modules/clinical/prescriptions.service';
import { TimelineService } from './modules/clinical/timeline.service';
import { ExamsController } from './modules/lab/exams.controller';
import { ExamsService } from './modules/lab/exams.service';
import { ImmunizationController } from './modules/immunization/immunization.controller';
import { ImmunizationService } from './modules/immunization/immunization.service';
import { DocumentsController } from './modules/documents/documents.controller';
import { DocumentsService } from './modules/documents/documents.service';
import { StorageService } from './modules/documents/storage.service';
import { PdfService } from './modules/documents/pdf.service';
import { DashboardController } from './modules/dashboard/dashboard.controller';
import { DashboardService } from './modules/dashboard/dashboard.service';
import { SearchController } from './modules/search/search.controller';
import { SearchService } from './modules/search/search.service';
import { NotificationsController } from './modules/notifications/notifications.controller';
import { NotificationsService } from './modules/notifications/notifications.service';
import { AuditController } from './modules/audit/audit.controller';
import { AuditQueryService } from './modules/audit/audit-query.service';

@Global()
@Module({
  providers: [DatabaseService, CryptoService, AuditService, SessionService, MailerService],
  exports: [DatabaseService, CryptoService, AuditService, SessionService, MailerService],
})
export class CoreModule {}

@Module({
  imports: [CoreModule],
  controllers: [
    HealthController,
    IdentityController,
    MembersController,
    TenantController,
    CatalogController,
    GuardiansController,
    PatientsController,
    AppointmentsController,
    EncountersController,
    PrescriptionsController,
    ExamsController,
    ImmunizationController,
    DocumentsController,
    DashboardController,
    SearchController,
    NotificationsController,
    AuditController,
  ],
  providers: [
    IdentityService,
    MembersService,
    TenantService,
    ProvisioningService,
    CatalogService,
    GuardiansService,
    PatientsService,
    AppointmentsService,
    EncountersService,
    PrescriptionsService,
    TimelineService,
    ExamsService,
    ImmunizationService,
    DocumentsService,
    StorageService,
    PdfService,
    DashboardService,
    SearchService,
    NotificationsService,
    AuditQueryService,
    { provide: APP_GUARD, useClass: AuthorizationGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
