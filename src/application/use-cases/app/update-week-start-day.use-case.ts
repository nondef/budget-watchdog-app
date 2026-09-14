import { IAppSettingsRepository } from '@/domain/interfaces/app-settings-repository.interface';
import { WeekDay } from '@/domain/value-objects/week-day';
import { StateNotInitializedException } from '@/domain/exceptions/domain.exception';
import { AppDTO } from "@/application";
import { AppMapper } from "@/application/mappers";
import { IUnitOfWork } from '@/domain';

export interface UpdateWeekStartDayInput {
    day: WeekDay;
}

export class UpdateWeekStartDayUseCase {
    constructor(
        private appSettingsRepository: IAppSettingsRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: UpdateWeekStartDayInput): Promise<AppDTO> {
        return this.unitOfWork.run(async () => {
            const settings = await this.appSettingsRepository.get();
            if (!settings) throw new StateNotInitializedException('AppSettings');

            settings.changeWeekStartDay(input.day);
            await this.appSettingsRepository.save(settings);
            return AppMapper.toDTO(settings);
        })
    }
}
