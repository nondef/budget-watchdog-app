import { IAppSettingsRepository } from '@/domain/interfaces/app-settings-repository.interface';
import { PrivacySettings } from '@/domain/value-objects/privacy-settings';
import { StateNotInitializedException } from '@/domain/exceptions/domain.exception';
import { AppDTO } from "@/application";
import { AppMapper } from "@/application/mappers";
import { IUnitOfWork } from '@/domain';

export interface UpdatePrivacySettingsInput {
    privacy: PrivacySettings;
}

export class UpdatePrivacySettingsUseCase {
    constructor(
        private appSettingsRepository: IAppSettingsRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: UpdatePrivacySettingsInput): Promise<AppDTO> {
        return this.unitOfWork.run(async () => {
            const settings = await this.appSettingsRepository.get();
            if (!settings) throw new StateNotInitializedException('AppSettings');

            settings.changePrivacy(input.privacy);
            await this.appSettingsRepository.save(settings);
            return AppMapper.toDTO(settings)
        })
    }
}
