"""Conservative temporal hysteresis for RNE 0.8 manual laboratory preview.

This router does NOT make a model safe. It reduces uncontrolled frame-to-frame
switching. It never authorizes automatic exporting or deployment.
"""
from __future__ import annotations
from dataclasses import dataclass
from math import isfinite

@dataclass
class SceneRouter:
    enter_margin_db:float=.25
    exit_margin_db:float=.10
    stable_enter_frames:int=3
    stable_exit_frames:int=2
    _in_rne:bool=False
    _above:int=0
    _below:int=0

    def __post_init__(self):
        if not (.1<=self.exit_margin_db<self.enter_margin_db<=2.):
            raise ValueError('Enter must exceed exit margin')
        if not (1<=self.stable_exit_frames<=8 and 1<=self.stable_enter_frames<=8):
            raise ValueError('Invalid hysteresis counters')

    def reset(self):
        self._in_rne=False
        self._above=0
        self._below=0

    def next_frame(self,*,estimated_gain_db:float,manual_opt_in:bool=False,
                   model_trusted:bool=False,scene_cut:bool=False,
                   protected_source:bool=True,memory_ok:bool=True)->dict:
        for flag in (manual_opt_in,model_trusted,scene_cut,protected_source,memory_ok):
            if type(flag) is not bool:raise TypeError('Boolean safety proof required')
        if not isinstance(estimated_gain_db,(float,int)) or isinstance(estimated_gain_db,bool) or not isfinite(estimated_gain_db):
            raise ValueError('Finite expected gain required')
        if scene_cut or not (manual_opt_in and model_trusted and protected_source and memory_ok):
            self.reset()
            return {'route':'bicubic_faithful','deployment_allowed':False,
                    'auto_export':False,'state_reset':True}
        if self._in_rne:
            if estimated_gain_db<self.exit_margin_db:self._below+=1
            else:self._below=0
            if self._below>=self.stable_exit_frames:self.reset()
        else:
            if estimated_gain_db>=self.enter_margin_db:self._above+=1
            else:self._above=0
            if self._above>=self.stable_enter_frames:
                self._in_rne=True;self._below=0;self._above=0
        return {'route':'rne04_manual_research_preview' if self._in_rne else 'bicubic_faithful',
                'deployment_allowed':False,'auto_export':False,'state_reset':False}