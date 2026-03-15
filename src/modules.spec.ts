import { AdminModule } from './admin/admin.module';
import { AdminsModule } from './admins/admins.module';
import { AppModule } from './app.module';
import { AuthModule } from './auth/auth.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DoctorsModule } from './doctors/doctors.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PatientsModule } from './patients/patients.module';

describe('Module definitions', () => {
  it('should load feature modules', () => {
    expect(AppModule).toBeDefined();
    expect(AuthModule).toBeDefined();
    expect(PatientsModule).toBeDefined();
    expect(DoctorsModule).toBeDefined();
    expect(AdminModule).toBeDefined();
    expect(NotificationsModule).toBeDefined();
    expect(DashboardModule).toBeDefined();
    expect(ConsultationsModule).toBeDefined();
    expect(AdminsModule).toBeDefined();
  });
});
