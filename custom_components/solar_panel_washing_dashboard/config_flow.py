"""Explicit opt-in to create a dedicated Solar Panel Washing dashboard."""
from homeassistant import config_entries
from homeassistant.core import callback
from .const import DOMAIN

class SolarPanelWashingDashboardFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="Solar Panel Washing Dashboard", data={})
        return self.async_show_form(step_id="user")

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return SolarPanelWashingDashboardOptionsFlow()

class SolarPanelWashingDashboardOptionsFlow(config_entries.OptionsFlow):
    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="", data={})
        return self.async_show_form(step_id="init")
