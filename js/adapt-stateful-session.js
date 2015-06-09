/*
* adapt-contrib-spoor
* License - http://github.com/adaptlearning/adapt_framework/LICENSE
* Maintainers - Kevin Corry <kevinc@learningpool.com>, Oliver Foster <oliver.foster@kineo.com>
*/

define([
	'coreJS/adapt',
	'./serializers/default'
], function(Adapt, serializer) {

	//Implements Adapt session statefulness
	
	var AdaptStatefulSession = _.extend({

		_sessionID: null,
		_config: null,

	//Session Begin
		initialize: function() {
			this.getConfig();
			this.checkSaveState();
			this.assignSessionId();
			this.setupEventListeners();
		},

		getConfig: function() {
			this._config = Adapt.config.get('_spoor');
		},

		checkSaveState: function() {
			var sessionPairs = Adapt.offlineStorage.get();
			var hasNoPairs = _.keys(sessionPairs).length === 0;

			if (hasNoPairs) this.saveSessionState();
			else this.restoreSessionState();
		},

		saveSessionState: function() {
			var sessionPairs = this.getSessionState();
			Adapt.offlineStorage.set(sessionPairs);
		},

		restoreSessionState: function() {
			var sessionPairs = Adapt.offlineStorage.get();

			if (sessionPairs.completion) serializer.deserialize(sessionPairs.completion);
			
			if (sessionPairs._isCourseComplete) Adapt.course.set('_isComplete', sessionPairs._isCourseComplete);
			
			if (sessionPairs._isAssessmentPassed) Adapt.course.set('_isAssessmentPassed', sessionPairs._isAssessmentPassed);
		},

		getSessionState: function() {
			var sessionPairs = {
				"completion": serializer.serialize(),
				"_isCourseComplete": Adapt.course.get("_isComplete") || false,
				"_isAssessmentPassed": Adapt.course.get('_isAssessmentPassed') || false
			};
			return sessionPairs;
		},

		assignSessionId: function () {
			this._sessionID = Math.random().toString(36).slice(-8);
		},

	//Session In Progress
		setupEventListeners: function() {
			this._onWindowUnload = _.bind(this.onWindowUnload, this);
			$(window).on('unload', this._onWindowUnload);

			this.listenTo(Adapt.blocks, 'change:_isComplete', this.onBlockComplete);
			this.listenTo(Adapt.course, 'change:_isComplete', this.onCompletion);
			this.listenTo(Adapt, 'assessment:complete', this.onAssessmentComplete);
			this.listenTo(Adapt, 'questionView:complete', this.onQuestionComplete);
			this.listenTo(Adapt, 'questionView:reset', this.onQuestionReset);
		},

		onBlockComplete: function(block) {
			this.saveSessionState();
		},

		onCompletion: function() {
			if (!this.checkTrackingCriteriaMet()) return;
			
			Adapt.offlineStorage.set("status", this._config._reporting._onTrackingCriteriaMet);
		},

		onAssessmentComplete: function(stateModel) {
			Adapt.course.set('_isAssessmentPassed', stateModel.isPass)
			
			this.saveSessionState();

			this.submitScore(stateModel.scoreAsPercent);

			if (stateModel.isPass) {
				this.onCompletion();
			} else if(this._config._tracking._requireAssessmentPassed) {
				this.submitAssessmentFailed();
			}
		},

		submitScore: function(score) {
			if (!this._config._tracking._shouldSubmitScore) return;
			
			Adapt.offlineStorage.set("score", score, 0, 100);
		},

		submitAssessmentFailed: function() {
			var onAssessmentFailure = this._config._reporting._onAssessmentFailure;
			if (onAssessmentFailure === "") return;
				
			Adapt.offlineStorage.set("status", onAssessmentFailure);
		},

		onQuestionComplete: function(questionView) {
			questionView.model.set('_sessionID', this._sessionID);
		},

		onQuestionReset: function(questionView) {
			if(this._sessionID !== questionView.model.get('_sessionID')) {
				questionView.model.set('_isEnabledOnRevisit', true);
			}
		},
		
		checkTrackingCriteriaMet: function() {
			var criteriaMet = false;

			if (this._config._tracking._requireCourseCompleted && this._config._tracking._requireAssessmentPassed) { // user must complete all blocks AND pass the assessment
				criteriaMet = (Adapt.course.get('_isComplete') && Adapt.course.get('_isAssessmentPassed'));
			} else if (this._config._tracking._requireCourseCompleted) { //user only needs to complete all blocks
				criteriaMet = Adapt.course.get('_isComplete');
			} else if (this._config._tracking._requireAssessmentPassed) { // user only needs to pass the assessment
				criteriaMet = Adapt.course.get('_isAssessmentPassed');
			}

			return criteriaMet;
		},

	//Session End
		onWindowUnload: function() {
			$(window).off('unload', this._onWindowUnload);

			this.stopListening();
		}
		
	}, Backbone.Events);

	return AdaptStatefulSession;

});