(function () {
    'use strict';

    angular
        .module('iconverse', []);

})();

(function () {
    'use strict';

    angular
        .module('iconverse')
        .directive('chatBubble', chatBubble);

    chatBubble.$inject = ['ChatService'];

    function chatBubble(ChatService) {
        return {
            scope: {
                message: '=',
                onClickLink: '&', //passes out the clicked link
                onClickAttachment: '&', //passes out the clicked message
                onClickChoice: '&', //passes out the clicked message
                linkLimit: "=?", //integer. specify the limit of links shown before the list is truncated
                onShowMore: '&', //triggered when show more is clicked
                onShowLess: '&' //triggered when show less is clicked
            },
            templateUrl: "app/iconverse/chat/components/chat-bubble.directive.html",
            link: function (scope) {

                console.log(scope.message);

                scope.linksLimitCount = scope.linkLimit || 5; //5 is default max
                scope.showAllLinks = false; //default

                scope.sourceIsUser = ChatService.isMessageFromUser(scope.message); //currently binary

                scope.hasAttachment = ChatService.isMessageWithAttachment(scope.message);

                scope.clickLink = function (link) {
                    if (angular.isFunction(scope.onClickLink)) {
                        scope.onClickLink({
                            link: link
                        });
                    }
                }

                scope.clickAttachment = function () {
                    if (angular.isFunction(scope.onClickAttachment)) {
                        console.log('sending', scope.message);
                        scope.onClickAttachment({
                            msg: scope.message
                        });
                    }
                }

                scope.clickChoice = function (choice) {
                    if (angular.isFunction(scope.onClickChoice)) {
                        scope.onClickChoice({
                            choice: choice,
                            msg: scope.message
                        });
                    }
                }

                scope.toggleShowAll = function () {
                    scope.showAllLinks = !scope.showAllLinks;

                    if (scope.showAllLinks &&
                        angular.isFunction(scope.onShowMore)) {
                        scope.onShowMore();
                    } else if (!scope.showAllLinks &&
                        angular.isFunction(scope.onShowLess)) {
                        scope.onShowLess()
                    }
                }

            }
        }
    }
})();

(function () {
    'use strict';
    angular
        .module('iconverse')
        .factory('ChatService', ChatService);

    ChatService.$inject = ['IconverseService', '$q',
  '$state', 'LoggerPanelService'];

    function ChatService(IconverseService, $q,
        $state, LoggerPanelService) {

        var ERROR_FALLBACK_MSG = "Sorry, we were unable to retrieve the requested information. Please try again later. Is there anything else I can help you with?";

        var _cid = null;
        var _lang = 'en';

        //the message which was last selected for viewing details in chat-detail
        var _latestSelectedMessage = null;

        //initialize conversation log
        var _conversationLog = [];

        return {

            setupMessage: function (text, cid) {
                return {
                    text: text || '',
                    cid: cid || _cid || null,
                    lang: _lang
                }
            },

            getSystemMessage: function (text, cid) {
                var msg = this.setupMessage(text, cid);
                msg.source = "system";
                return msg;
            },

            getUserMessage: function (text, cid, choice, element, query) {
                var msg = this.setupMessage(text, cid);
                msg.source = "user";
                if (choice) msg.value = choice;

                if (element && query) {
                    msg.element = element;
                    msg.query = query;
                }
                return msg;
            },

            //binds the current conversation to the passed in vm, on the specified property name
            bindConversation: function (vm, propertyName) {
                return vm[propertyName] = _conversationLog;
            },

            addUserMessage: function (text) {
                _conversationLog.push(this.getUserMessage(text));
            },

            addSystemMessage: function (text) {
                _conversationLog.push(this.getSystemMessage(text));
            },

            setLatestSelectedMessage: function (message) {
                _latestSelectedMessage = message;
            },

            getLatestSelectedMessage: function () {
                return _latestSelectedMessage;
            },

            clearConversationLog: function () {
                _conversationLog = [];
                _cid = null;
                _latestSelectedMessage = null;
                console.log('cleared');
            },

            // resolves with the current CID. If not CID is present
            // a new session is started and the newly created CID returned.
            // internally also sets the current CID 
            getCurrentConversationId: function () {
                var deferred = $q.defer();
                if (_cid !== null) {
                    deferred.resolve(_cid);
                } else {
                    IconverseService.startSession().then(function (data) {
                            console.log(data.data);
                            var id = data.data;
                            _cid = id;
                            deferred.resolve(id);
                        })
                        .catch(function (err) {
                            deferred.reject("Error starting iConverse Session: " + err);
                        })
                }

                return deferred.promise;
            },

            processUserMessage: function (text, choiceValue, element, query, omitUserMsgFromLog) {
                var self = this;

                var deferred = $q.defer();

                if (!omitUserMsgFromLog) {
                    this.addUserMessage(text); //push user message into log  
                }

                this.getCurrentConversationId()
                    .then(function (cid) {
                        var msg = self.getUserMessage(text, cid, choiceValue, element, query);
                        return IconverseService.sendMessage(msg);
                    })
                    .then(function (replyMsg) {
                        LoggerPanelService.success('Received response from iconverse server');

                        _cid = replyMsg.cid;

                        console.log(replyMsg);

                        self.processReplyMessage(replyMsg);

                        _conversationLog.push(replyMsg); //push system message into log           

                        deferred.resolve(replyMsg);

                    })
                    .catch(function (err) {
                        LoggerPanelService.error("Did not receive valid response from server", err);

                        var fauxReply = self.getSystemMessage(ERROR_FALLBACK_MSG);
                        _conversationLog.push(fauxReply);
                        deferred.resolve(fauxReply);
                    });

                return deferred.promise;
            },

            processReplyMessage: function (replyMsg) {
                //handle action - might want to shift logic into service
                if (angular.isObject(replyMsg.payload) && replyMsg.payload.action) {
                    if (replyMsg.payload.action === 'Navigate') {
                        console.log('entered');
                        this.openNavigator(replyMsg.payload.place + " Singapore"); //append 'Singapore' behind to ensure SG results
                    }
                }
            },

            openNavigator: function (destination) {
                $state.go('app.navigator', {
                    destination: destination
                });
            },

            getLatestReplyMessage: function () {
                return _conversationLog[_conversationLog.length - 1];
            },

            //LOGIC METHODS
            isMessageWithList: function (message) {
                return angular.isArray(message.links) && message.links.length > 0;
            },

            isMessageWithDetailedContent: function (message) {
                return angular.isObject(message.payload) && message.payload.size > 0 && !this.isMessageWithWeather(message);
            },

            isMessageWithWeather: function (message) {
                return angular.isObject(message.payload) && message.payload.size === 1 && message.payload.elements[0].properties.temperatureValue;
            },

            isMessageWithAttachment: function (message) {
                return this.isMessageWithList(message) || this.isMessageWithDetailedContent(message);
            },

            isMessageFromUser: function (message) {
                return message.source === 'user';
            },

            getMessageTypeAndContent: function (message) {
                var content;
                if (this.isMessageWithList(message)) {
                    content = message.links; //is a list of links
                    return {
                        type: "LINKS",
                        content: content
                    };
                } else if (this.isMessageWithDetailedContent(message)) {
                    content = message.payload.elements; //is an array of detailed content
                    return {
                        type: "DETAILS",
                        content: content
                    };
                }
            }

            // getWeatherForecastData: function(addressString){
            //   return WeatherForecastService.getForecastDataByAddress(addressString)
            //   .then(function(data){
            //     if(angular.isObject(data)){
            //       //parse the data and take only what is needed
            //       return {
            //         description: data["IconPhrase"],
            //         temperature: data["Temperature"].value,
            //         chanceOfRain: data["PrecipitationProbability"],
            //         icon: data["WeatherIcon"]
            //       }
            //     }
            //   })
            // }
        }

    }
})();

angular.module('iconverse')

    .filter('sanitize', ['$sce', function ($sce) {
        return function (htmlCode) {
            return $sce.trustAsHtml(htmlCode);
        };
}]);
angular.module('iconverse')

    .controller('ChatController', function ($scope, ChatService, $state,
        $ionicScrollDelegate, $cordovaLaunchNavigator, $timeout, $window) {

        var vm = this;

        // Bind viewmodel to the conversation log, on the property `conversation`
        // conversation is a simply an array of Message objects 
        // note: conversation is maintained in ChatService so its state can be shared across controllers 
        ChatService.bindConversation(vm, 'conversation');

        //if there is a past log, 
        if (vm.conversation.length) {
            //this will never run since we currently don't store persist the conversation's state
        } else {
            //if there is no conversation, let's welcome the user
            ChatService.addSystemMessage("Hello Officer, how can I help you today?");
        }

        // watch for changes to the conversation array and scroll to the bottom. 
        var scrollToBottomDebounced = _.debounce(function () {
            $ionicScrollDelegate.scrollBottom(false); //false means no animation
        }, 10);
        $scope.$watch('vm.conversation.length', function (val) {
            if ($state.current.name === 'app.chat' && val) scrollToBottomDebounced();
        });


        var errorHandler = function (err) {
            console.error(err);
            ChatService
                .addSystemMessage("My apologies, but I'm not available the moment. Could we speak again a little later?");
        }

        //process the user entered message
        vm.processEntry = function () {
            vm.latestEntry = vm.entry;

            vm.entry = ""; //clear the input

            ChatService.processUserMessage(vm.latestEntry)
                .then(function (replyMsg) {
                    //processing all done at service at the moment
                })
                .catch(errorHandler);
        };

        //if any click is clicked
        vm.clickChatLink = function (link) {
            console.log('link clicked', link);
            // trigger a message on behalf of the user
            ChatService.processUserMessage(link.text, null, link.element, link.query);
        };

        //if any message attachment was clicked
        vm.clickAttachment = function (message) {
            console.log('attachment clicked', message);
            ChatService.setLatestSelectedMessage(message);
            $state.go('app.chat-detail');
        };

        //if any choice was selected on a mesage
        vm.clickChoice = function (choice, message) {
            console.log('choice selected', choice);
            console.log('choice for message', message);

            //each choice has a `text` and a `value`  
            ChatService.processUserMessage(choice.value, choice.value)
                .then(function (replyMsg) {
                    //processing all done at service at the moment
                })
                .catch(errorHandler);
        }

        vm.record = function () {
            var recognition;

            if (angular.isUndefined(window.cordova)) {
                //recognition = new webkitSpeechRecognition(); //To Computer
                $scope.app.showBasicAlert("Note", "Speech Recognition is not available when previewing on a web browser");
                return;
            } else {
                recognition = new SpeechRecognition(); // To Device
            }

            recognition.lang = 'en-US';

            recognition.onresult = function (event) {
                if (event.results.length > 0) {
                    vm.entry = event.results[0][0].transcript;
                    $scope.$apply();

                    //programmatically trigger process after x ms
                    $timeout(function () {
                        vm.processEntry();
                    }, 100);
                }
            };

            recognition.start();
        };



    });
(function () {
    'use strict';

    angular
        .module('iconverse')
        .controller('ChatDetailController', ChatDetailController);

    ChatDetailController.$inject = ['ChatService', '$scope', '$stateParams', '$state'];

    function ChatDetailController(ChatService, $scope, $stateParams, $state) {
        var vm = this;

        var loadContent = function () {
            var msg = ChatService.getLatestSelectedMessage();
            if (angular.isObject(msg)) {
                var data = ChatService.getMessageTypeAndContent(msg);
                vm.type = data.type;
                vm.content = data.content;

                if (vm.type === "LINKS") {
                    vm.title = "Select an option";
                } else if (vm.type === "DETAILS") {
                    vm.title = "Offence Details";
                }
            }
        }

        //reload content everytime this view in entered
        $scope.$on("$ionicView.beforeEnter", function (event, data) {
            //console.log("State Params: ", data.stateParams);
            loadContent(); //initial load
        });


        vm.selectListItem = function (link) {
            // trigger a message on behalf of the user
            ChatService.processUserMessage(link.text, null, link.element, link.query);
            // then route the user to the chat panel
            $state.go('app.chat');
        }


        //open file in document viewer for mobile
        vm.openInAppForMobile = function (url) {
            if (cordova) {
                cordova.InAppBrowser.open(url, '_blank', 'location=no,enableViewportScale=yes,closebuttoncaption=Close');
            } else {
                console.err('cordova not found');
            }
        }

    }
})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi', ['ngAnimate', 'ngCookies', 'ngTouch',
            'ngSanitize', 'ngMessages', 'ngAria', 'ngResource',
            'ui.router', 'ui.bootstrap', 'toastr',
            'luegg.directives', 'angularMoment',
            'thatisuday.dropzone', 'cgBusy',
            'firebase',
            'xeditable',
            'hl.sticky',

            'iconverse'


            ]);

})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .service('webDevTec', webDevTec);

    /** @ngInject */
    function webDevTec() {
        var data = [
            {
                'title': 'AngularJS',
                'url': 'https://angularjs.org/',
                'description': 'HTML enhanced for web apps!',
                'logo': 'angular.png'
      },
            {
                'title': 'BrowserSync',
                'url': 'http://browsersync.io/',
                'description': 'Time-saving synchronised browser testing.',
                'logo': 'browsersync.png'
      },
            {
                'title': 'GulpJS',
                'url': 'http://gulpjs.com/',
                'description': 'The streaming build system.',
                'logo': 'gulp.png'
      },
            {
                'title': 'Jasmine',
                'url': 'http://jasmine.github.io/',
                'description': 'Behavior-Driven JavaScript.',
                'logo': 'jasmine.png'
      },
            {
                'title': 'Karma',
                'url': 'http://karma-runner.github.io/',
                'description': 'Spectacular Test Runner for JavaScript.',
                'logo': 'karma.png'
      },
            {
                'title': 'Protractor',
                'url': 'https://github.com/angular/protractor',
                'description': 'End to end test framework for AngularJS applications built on top of WebDriverJS.',
                'logo': 'protractor.png'
      },
            {
                'title': 'Bootstrap',
                'url': 'http://getbootstrap.com/',
                'description': 'Bootstrap is the most popular HTML, CSS, and JS framework for developing responsive, mobile first projects on the web.',
                'logo': 'bootstrap.png'
      },
            {
                'title': 'Angular UI Bootstrap',
                'url': 'http://angular-ui.github.io/bootstrap/',
                'description': 'Bootstrap components written in pure AngularJS by the AngularUI Team.',
                'logo': 'ui-bootstrap.png'
      },
            {
                'title': 'Sass (Node)',
                'url': 'https://github.com/sass/node-sass',
                'description': 'Node.js binding to libsass, the C version of the popular stylesheet preprocessor, Sass.',
                'logo': 'node-sass.png'
      }
    ];

        this.getTec = getTec;

        function getTec() {
            return data;
        }
    }

})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .component('testComponent', {
            bindings: {},
            templateUrl: 'app/components/test-component/test-component.component.html',
            controller: function () {

            }
        });


})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .directive('acmeNavbar', acmeNavbar);

    /** @ngInject */
    function acmeNavbar() {
        var directive = {
            restrict: 'E',
            templateUrl: 'app/components/navbar/navbar.html',
            scope: {
                creationDate: '='
            },
            controller: NavbarController,
            controllerAs: 'vm',
            bindToController: true
        };

        return directive;

        /** @ngInject */
        function NavbarController(moment) {
            var vm = this;

            // "vm.creationDate" is available by directive option "bindToController: true"
            vm.relativeDate = moment(vm.creationDate).fromNow();
        }
    }

})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .directive('acmeMalarkey', acmeMalarkey);

    /** @ngInject */
    function acmeMalarkey(malarkey) {
        var directive = {
            restrict: 'E',
            scope: {
                extraValues: '='
            },
            template: '&nbsp;',
            link: linkFunc,
            controller: MalarkeyController,
            controllerAs: 'vm'
        };

        return directive;

        function linkFunc(scope, el, attr, vm) {
            var watcher;
            var typist = malarkey(el[0], {
                typeSpeed: 40,
                deleteSpeed: 40,
                pauseDelay: 800,
                loop: true,
                postfix: ' '
            });

            el.addClass('acme-malarkey');

            angular.forEach(scope.extraValues, function (value) {
                typist.type(value).pause().delete();
            });

            watcher = scope.$watch('vm.contributors', function () {
                angular.forEach(vm.contributors, function (contributor) {
                    typist.type(contributor.login).pause().delete();
                });
            });

            scope.$on('$destroy', function () {
                watcher();
            });
        }

        /** @ngInject */
        function MalarkeyController($log, githubContributor) {
            var vm = this;

            vm.contributors = [];

            activate();

            function activate() {
                return getContributors().then(function () {
                    $log.info('Activated Contributors View');
                });
            }

            function getContributors() {
                return githubContributor.getContributors(10).then(function (data) {
                    vm.contributors = data;

                    return vm.contributors;
                });
            }
        }

    }

})();

(function () {
    'use strict';
    angular
        .module('aiaVaUi')
        .factory('LoggerPanelService', LoggerPanelService);

    LoggerPanelService.$inject = ['$timeout'];

    function LoggerPanelService($timeout) {

        var _logs = [];

        var LOG_LEVEL = {
            LOG: "LOG",
            INFO: 'INFO',
            ERROR: 'ERROR',
            SUCCESS: 'SUCCESS'
        };

        var appendToLog = function (text, type) {
            $timeout(function () {
                _logs.push({
                    text: text,
                    type: type,
                    timestamp: new Date()
                })
            });

        }

        return {
            log: function (text) {
                appendToLog(text, LOG_LEVEL.LOG);
                console.log(text);
            },
            info: function (text) {
                appendToLog(text, LOG_LEVEL.INFO);
            },
            error: function (text, e) {
                appendToLog(text, LOG_LEVEL.ERROR);
                console.error(text, e);
            },
            success: function (text, e) {
                appendToLog(text, LOG_LEVEL.SUCCESS);
                console.log(text);
            },
            clearLog: function () {
                _logs = [];
            },
            addStamp: function () {
                appendToLog("--- STAMP ---", LOG_LEVEL.INFO);
            },
            bindToLogs: function (scope, property) {
                scope[property] = _logs;
            }
        }
    }
})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .component('loggerPanel', {
            bindings: {
                api: '='
            },
            templateUrl: 'app/components/logger-panel/logger-panel.component.html',
            controller: function (LoggerPanelService) {

                var $ctrl = this;

                LoggerPanelService.bindToLogs($ctrl, 'logs');

                $ctrl.showLogs = true; //show by default

                $ctrl.TYPE = {
                    LOG: "LOG",
                    INFO: 'INFO',
                    ERROR: 'ERROR',
                    SUCCESS: 'SUCCESS'
                }

                $ctrl.clearLog = function () {
                    LoggerPanelService.clearLog();
                    LoggerPanelService.bindToLogs($ctrl, 'logs');
                }

                $ctrl.addStamp = function () {
                    LoggerPanelService.addStamp();
                }

                $ctrl.api = {
                    log: function (text) {
                        LoggerPanelService.log(text);
                    },
                    info: function (text) {
                        LoggerPanelService.info(text);
                    },
                    error: function (text, e) {
                        LoggerPanelService.error(text, e);
                    },
                    success: function (text, e) {
                        LoggerPanelService.success(text, e);
                    }
                }

            }
        });


})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .factory('githubContributor', githubContributor);

    /** @ngInject */
    function githubContributor($log, $http) {
        var apiHost = 'https://api.github.com/repos/Swiip/generator-gulp-angular';

        var service = {
            apiHost: apiHost,
            getContributors: getContributors
        };

        return service;

        function getContributors(limit) {
            if (!limit) {
                limit = 30;
            }

            return $http.get(apiHost + '/contributors?per_page=' + limit)
                .then(getContributorsComplete)
                .catch(getContributorsFailed);

            function getContributorsComplete(response) {
                return response.data;
            }

            function getContributorsFailed(error) {
                $log.error('XHR Failed for getContributors.\n' + angular.toJson(error.data, true));
            }
        }
    }
})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .directive('documentListItem', documentListItem)

    documentListItem.$inject = ['$timeout', 'DocumentParserService', '$state'];

    function documentListItem($timeout, DocumentParserService, $state) {
        return {
            scope: {
                api: '=',
                document: '=',
                onProcessed: "&",
                deleteClicked: "&",
                hideArrowIcon: "="
            },
            templateUrl: 'app/components/document-list-item/document-list-item.component.html',
            link: function (scope) {

                var $ctrl = scope.$ctrl = {};

                $ctrl.doc = scope.document;

                $ctrl.state = "UPLOAD"; // ["OCR", "EXTRACT", "COMPLETE"]

                $ctrl.currentLoadProgress = 10;

                $ctrl.hideArrowIcon = scope.hideArrowIcon || false;

                $ctrl.delete = function ($event) {
                    $event.stopPropagation();
                    scope.deleteClicked();
                }

                $ctrl.viewData = function () {
                    $state.go('approver.view-document', {
                        docId: $ctrl.doc.$id
                    });
                }

                var rate = {
                    "UPLOAD": {
                        min: 0.8,
                        max: 1,
                        thresholdPerc: 20
                    },
                    "CLASSIFY": {
                        min: 0.8,
                        max: 1,
                        thresholdPerc: 35
                    },
                    "OCR": {
                        min: 0.5,
                        max: 0.8,
                        thresholdPerc: 65
                    },
                    "EXTRACT": {
                        min: 0.3,
                        max: 0.9,
                        thresholdPerc: 99
                    }
                };

                var randIntBetween = function (min, max) {
                    var randInt = Math.floor((Math.random() * max) + min); //betw 1 and 10
                    // console.log('randomINt', randInt);
                    return randInt;
                }

                var randProbabilityForState = function (state) {
                    var randProb = randIntBetween(rate[state].min * 10, rate[state].max * 10) / 10;
                    // console.log('random probability: ' + randProb);
                    return randProb;
                }

                var runTickAfter = function (ms) {
                    var tickTimeoutFn = $timeout(function () {
                        tick();
                    }, ms);
                }

                // function to run at every tick
                var tick = function () {
                    var increment = randProbabilityForState($ctrl.state) * randIntBetween(1, 10);
                    $ctrl.currentLoadProgress += increment;

                    if ($ctrl.currentLoadProgress < 100) {
                        runTickAfter(randIntBetween(100, 600));

                        if ($ctrl.currentLoadProgress < rate.UPLOAD.thresholdPerc) {
                            $ctrl.state = "UPLOAD";
                        } else if ($ctrl.currentLoadProgress < rate.CLASSIFY.thresholdPerc) {
                            $ctrl.state = "CLASSIFY";
                        } else if ($ctrl.currentLoadProgress < rate.OCR.thresholdPerc) {
                            $ctrl.state = "OCR";
                        } else {
                            $ctrl.state = "EXTRACT";
                        }
                    } else {
                        //once complete faux loading, save to firebase and return the document model
                        DocumentParserService.getDocumentKey($ctrl.doc)
                            .then(function (key) {
                                $ctrl.doc.key = key;
                                $ctrl.state = "COMPLETE";
                                console.log("onprocessed fn", scope.onProcessed);
                                if (angular.isFunction(scope.onProcessed)) {
                                    scope.onProcessed();
                                    console.log('did run');
                                }
                            })

                    }
                };

                // initial start, but not if it is already loaded
                if (!$ctrl.doc.hasLoaded) {
                    runTickAfter(100);
                }



            }

        }

    }



})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .directive('documentViewer', documentViewer)

    documentViewer.$inject = ['$timeout', 'DocumentParserService', '$state', '$q'];

    function documentViewer($timeout, DocumentParserService, $state, $q) {
        return {
            scope: {
                api: '='
            },
            templateUrl: 'app/components/document-viewer/document-viewer.component.html',
            link: function (scope) {

                var $ctrl = scope.$ctrl = {};

                var _pdf;

                var _currentDocUrl;

                $ctrl.datapoints;

                $ctrl.currDatapointIndex = 0;

                scope.api = {
                    setDatapoints: function (datapoints) {
                        console.log('got the dps', datapoints);

                        //clear previous annotations
                        $ctrl.annotations = [];

                        //sort datapoints by confidence (show highest confidence first)
                        datapoints = _.sortBy(datapoints, function (dp) {
                            return dp.confidence
                        }).reverse();
                        console.log(datapoints);

                        // create the annotation(s)
                        if (angular.isArray(datapoints) && datapoints.length) {

                            $ctrl.datapoints = datapoints;
                            $ctrl.currDatapointIndex = 0; // reset

                            $ctrl.loadDatapointAtIndex($ctrl.currDatapointIndex); // first load                
                        }
                    }
                };

                $ctrl.loadDatapointAtIndex = function (index) {
                    $ctrl.currDatapointIndex = index;
                    $ctrl.currentDatapoint = $ctrl.datapoints[index];
                    loadDocument($ctrl.currentDatapoint.documentUrl)
                        .then(function () {
                            $ctrl.annotations = $ctrl.currentDatapoint.positions;

                            $ctrl.hasData = true;

                            console.log("loaded dp", $ctrl.currentDatapoint);
                        });

                }

                var loadDocument = function (url) {
                    var deferred = $q.defer();

                    if (_currentDocUrl === url) {
                        deferred.resolve();
                    } else {
                        _currentDocUrl = url;

                        //load the document
                        PDFJS.getDocument(url)
                            .then(function (pdf) {
                                _pdf = pdf;

                                return $ctrl.getPage(1).then(function () {
                                    console.log('done');
                                    deferred.resolve();
                                })

                            });
                    }

                    $ctrl.loading = deferred.promise;

                    return $ctrl.loading;
                }


                $ctrl.getPage = function (pageNum) {
                    // Fetch the first page page.
                    return _pdf.getPage(pageNum).then(function (page) {
                        var scale = 1;
                        var viewport = page.getViewport(scale);

                        // Prepare canvas using PDF page dimensions.
                        var canvas = document.getElementById('the-canvas');
                        var context = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;

                        // Render PDF page into canvas context.
                        var renderContext = {
                            canvasContext: context,
                            viewport: viewport
                        };
                        page.render(renderContext);
                    });
                }

            }

        }

    }



})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .directive('applicationForm', applicationForm)

    applicationForm.$inject = ['$timeout', 'DocumentParserService', '$state', '$rootScope', '$q'];

    function applicationForm($timeout, DocumentParserService, $state, $rootScope, $q) {
        return {
            scope: {
                api: '=',
                documentViewerApi: '=',
                onFormSubmitFn: '&',
                userId: '='
            },
            templateUrl: 'app/components/application-form/application-form.component.html',
            link: function (scope) {

                var $ctrl = scope.$ctrl = {};

                $ctrl.inputData = {}; // holds all the ng-model input data, with key as dataKey

                $ctrl.metadata = {}; // holds the metadata inserted by imatch

                // API interface for this component
                scope.api = {
                    // get all the dataKeys registered
                    getDataKeys: function () {
                        return $ctrl.formSections.map(function (section) {
                            return _.map(section.fields, 'dataKey');
                        });
                    },

                    clearAllFields: function (force) {

                        // iterte through fields and delete any fields that
                        // have not been edited by user   
                        var keys = _.flatten(scope.api.getDataKeys());

                        if (force) console.info('force clearing all appForm fields!');

                        console.log('clearing datakeys', keys);

                        angular.forEach(keys, function (dataKey) {
                            scope.api.setDataForDataKey(dataKey, null, force);
                        })
                    },

                    // set input by dataKey
                    setDataForDataKey: function (dataKey, datapoints, force) {

                        // if a null datapoints is passed in, it means we are resetting this field
                        if (!datapoints) {
                            // if the field is unedited or this is forced, execute the reset
                            // otherwise, leave the field untouched
                            if (!$ctrl.isFieldUserChanged(dataKey) || force) {
                                $ctrl.inputData[dataKey] = "";
                                $ctrl.metadata[dataKey] = null;
                            }

                            return;
                        }

                        // update the appropriate input field
                        var highestConfidenceDatapoint = _.maxBy(datapoints, function (dp) {
                            return dp.confidence
                        });

                        // if a field with the datakey is present, and it has not been touched,              
                        if (scope.appForm[dataKey] && (!$ctrl.isFieldUserChanged(dataKey) || force)) {
                            //update the field
                            $ctrl.inputData[dataKey] = highestConfidenceDatapoint.value;
                        }

                        // overall confidence is taken by:
                        // 1. take the highest confidence datapoint (HDP)
                        // 2. find all the datapoints that have the exact value as HDP's value
                        // 3. overallConfidence is the sum of all the confidences
                        var overallConfidence = highestConfidenceDatapoint.confidence;
                        var matchingDatapoints = _.filter(datapoints, function (dp) {
                            return dp.value === highestConfidenceDatapoint.value;
                        });
                        overallConfidence += _.sumBy(matchingDatapoints, 'confidence');

                        // set the metadata for the key
                        $ctrl.metadata[dataKey] = {
                            datapoints: datapoints,
                            overallConfidence: overallConfidence,
                            evaluatedValue: highestConfidenceDatapoint.value
                        };

                        // console.log($ctrl.metadata);
                    }
                };

                // if the field is a dropdown, return its options
                var getFieldDropdownOptions = function (dataKey) {
                    var field = getFormElement(dataKey);
                    if (field && field.type === 'select') return field.options;
                };

                var getFormElement = function (dataKey) {
                    var found;
                    angular.forEach($ctrl.formSections, function (section) {
                        angular.forEach(section.fields, function (field) {
                            if (field.dataKey === dataKey) found = field;
                        })
                    });
                    return found;
                }

                $ctrl.isFieldUserChanged = function (dataKey) {
                    return scope.appForm[dataKey] && scope.appForm[dataKey].$dirty;
                }

                $ctrl.setFieldUserChanged = function (dataKey, isChanged) {
                    if (scope.appForm[dataKey]) {
                        scope.appForm[dataKey].$setDirty(isChanged);
                    }
                }

                $ctrl.viewDatapoints = function (dataKey) {
                    // $rootScope.$broadcast('documentviewer:viewDatapoints', $ctrl.metadata[dataKey].datapoints);
                    scope.documentViewerApi.setDatapoints($ctrl.metadata[dataKey].datapoints);
                }

                $ctrl.revertFieldUserChanges = function (dataKey) {
                    scope.api.setDataForDataKey(dataKey, $ctrl.metadata[dataKey].datapoints, true);
                    scope.appForm[dataKey].$setPristine(true);
                };

                $ctrl.submit = function () {
                    $ctrl.isSubmitting = true;

                    var deferred = $q.defer();

                    $timeout(function () {

                        DocumentParserService.clearWorkingDocuments()
                            .then(function () {
                                $ctrl.isSubmitting = false;
                                $state.go('apply-success', {
                                    userId: scope.userId
                                });
                                deferred.resolve();
                            })
                            .catch(function () {
                                deferred.reject();
                            })

                    }, 1500);

                    $ctrl.loading = deferred.promise;

                    return $ctrl.loading;
                }

                // THE FORM INPUTS -- might wanna shift this into a json
                $ctrl.formSections = [
                    {
                        "header": "PERSONAL DETAILS",
                        "fields": [
                            {
                                "label": "Citizenship",
                                "type": "select",
                                "options": ["Singaporean", "Singapore PR", "Foreigner"],
                                "dataKey": "CITIZENSHIP" // must correspond with metadata dataKey
              },
                            {
                                "label": "Full Name",
                                "dataKey": "NAME" // must correspond with metadata dataKey
              },
                            {
                                "label": "NRIC / FIN",
                                "dataKey": "ID"
              },
                            {
                                "label": "Birth Date",
                                "dataKey": "DOB"
              },
                            {
                                "label": "Postal Code",
                                "dataKey": "POSTALCODE"
              },
                            {
                                "label": "Address 1",
                                "dataKey": "ADDRESS"
              },
                            {
                                "label": "Address 2",
                                "dataKey": "ADDRESS_TWO"
              },
            ]
          },
                    {
                        "header": "EMPLOYMENT DETAILS",
                        "fields": [
                            {
                                "label": "Company Name",
                                "dataKey": "COMPANY_NAME"
              },
                            {
                                "label": "Job Title",
                                "dataKey": "JOB_TITLE"
              },
                            {
                                "label": "Employment Status",
                                "dataKey": "EMP_STATUS",
                                "type": "select",
                                "options": ["Employed", "Unemployed", "Self-Employed"]
              },
                            {
                                "label": "Years Of Employment",
                                "dataKey": "EMP_YEARS"
              },
                            {
                                "label": "Monthly Income (SGD)",
                                "dataKey": "MONTHLY_INCOME"
              }
            ]
          },
        ];


            }

        }

    }



})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .controller('SocketController', SocketController);

    /** @ngInject */
    function SocketController($timeout, webDevTec, toastr, ChatService, $scope, VoiceRecognitionService) {
        var vm = this;

        // Rodrigo's paths
        // var speechServerPath = "http://localhost:8081";
        // var websocketPath = "ws://localhost:8081";

        // Garreth's paths
        var speechServerPath = VoiceRecognitionService.getApiPath();
        var websocketPath = VoiceRecognitionService.getWebsocketPath();

        vm.results = [];


        var TIMEOUT = 20000; //how long to record audio for (ms)
        var wait = 4000; //wait time before starting record (ms)
        var interval = 100; //interval between each send (1 ms is almost realtime, as required by )

        var stompClient = {
            client: null,
            socket: null,
            connect: function () {
                this.socket = new SockJS(speechServerPath + '/websocket');
                this.client = Stomp.over(this.socket);
                //            this.client.debug = null;
                this.client.connect({}, function (frame) {
                    stompClient.client.subscribe('/topic/pingpong', function (events) {
                        stompClient.consume(events);
                    });
                });
            },
            consume: function (raw) {
                console.log(raw);
            },
            close: function () {
                if (this.client != null && this.client != undefined) {
                    this.client.unsubscribe('/topic/pingpong');
                    this.client.disconnect();
                    this.client = null;
                }
            }
        };

        vm.connect = function () {
            stompClient.connect();
        }

        vm.disconnect = function () {
            stompClient.close();
        }

        vm.send = function () {
            stompClient.client.send("/app/ping", {}, "");
        }


        var mediaConstraints = {
            audio: true
        };


        navigator.getUserMedia(mediaConstraints, onMediaSuccess, onMediaError);

        var mediaRecorder;

        function onMediaSuccess(stream) {
            mediaRecorder = new MediaStreamRecorder(stream);
            mediaRecorder.recorderType = StereoAudioRecorder;
            mediaRecorder.audioChannels = 1;
            mediaRecorder.sampleRate = 44100;
            mediaRecorder.mimeType = 'audio/wav'; // check this line for audio/wav

            mediaRecorder.ondataavailable = function (blob) {
                // POST/PUT "Blob" using FormData/XHR2
                var blobURL = URL.createObjectURL(blob);
                //document.write('<a href="' + blobURL + '">' + blobURL + '</a>');
                // var base64data;
                // var reader = new window.FileReader();
                // reader.readAsDataURL(blob);
                // reader.onloadend = function() {
                //   base64data = reader.result;
                //   console.log('sending');

                //   stompClient.client.send("/app/ping", {}, base64data);
                // }

                ws.send(blob); // Blob object

            };


            // console.log("Ending recording in " + TIMEOUT + " ms");
            // setTimeout(function(){
            //     mediaRecorder.stop();
            // }, TIMEOUT)
        }

        function onMediaError(e) {
            console.error('media error', e);
        }

        vm.closeSocket = function () {
            mediaRecorder.stop();
            ws.close();
        }

        var ws;

        vm.openSocket = function () {
            ws = new WebSocket(websocketPath + "/binary");
            ws.binaryData = "blob";

            ws.onopen = function () {
                console.log('connection open!');
                console.log('streaming at every ' + interval);
                mediaRecorder.start(interval); //interval in ms
            };

            var writeToResults = function (text) {
                $timeout(function () {
                    vm.results.push(text);
                });
            }

            ws.onmessage = function (e) {
                var blob = e.data;
                var reader = new FileReader();
                reader.onload = function () {
                    var text = reader.result;
                    writeToResults(text);
                };
                reader.readAsText(blob);
            }
        }




        // var stompClient = null;

        // // function setConnected(connected) {
        // //     $("#connect").prop("disabled", connected);
        // //     $("#disconnect").prop("disabled", !connected);
        // //     if (connected) {
        // //         $("#conversation").show();
        // //     }
        // //     else {
        // //         $("#conversation").hide();
        // //     }
        // //     $("#greetings").html("");
        // // }

        // var server = "localhost:8080";

        // function connect() {
        //     var socket = new SockJS(server + '/gs-guide-websocket');
        //     stompClient = Stomp.over(socket);
        //     stompClient.connect({}, function (frame) {
        //         //setConnected(true);
        //         console.log('Connected: ' + frame);
        //         stompClient.subscribe('/topic/greetings', function (greeting) {
        //             $timeout(function(){
        //               showGreeting(JSON.parse(greeting.body).content);
        //             })
        //         });
        //     });
        // }

        // function disconnect() {
        //     if (stompClient != null) {
        //         stompClient.disconnect();
        //     }
        //     //setConnected(false);
        //     console.log("Disconnected");
        // }

        // function sendName() {
        //     stompClient.send("/app/hello", {}, JSON.stringify({'name': vm.name}));
        // }

        // function showGreeting(message) {
        //   console.log(message);
        // }

        // vm.connect = connect;
        // vm.send = sendName;

        //     // JQuery("form").on('submit', function (e) {
        //     //     e.preventDefault();
        //     // });
        //     // $( "#connect" ).click(function() { connect(); });
        //     // $( "#disconnect" ).click(function() { disconnect(); });
        //     // $( "#send" ).click(function() { sendName(); });

    }
})();

(function () {
    'use strict';
    angular
        .module('iconverse')
        .factory('VoiceRecognitionService', VoiceRecognitionService);

    VoiceRecognitionService.$inject = ['$http', 'UtilityService', '_', 'LoggerPanelService'];

    function VoiceRecognitionService($http, UtilityService, _, LoggerPanelService) {

        //speechserver path
        // var server = "http://localhost:8080";
        //var websocketPath = "ws://localhost:8080";

        var server = "https://aia-dev.taiger.com:8080";
        var websocketPath = "wss://aia-dev.taiger.com:8080";

        //var server = "http://localhost:8081";
        //var websocketPath = "ws://localhost:8081";

        var API = {
            sendAudio: server + '/speech/upload'
        };

        var numberMap = {
            zero: "0",
            one: "1",
            two: "2",
            three: "3",
            four: "4",
            five: "5",
            six: "6",
            seven: "7",
            eight: "8",
            nine: "9",
            ten: "10"
        };

        //note: only replaces words 
        //  any one  --> any 1
        //  anyone --> anyone
        var replaceAll = UtilityService.replaceAll;

        return {

            getWebsocketPath: function () {
                return websocketPath;
            },

            getApiPath: function () {
                return server;
            },

            getTextFromAudioFile: function (file) {
                var fd = new FormData();
                fd.append('file', file);

                return $http.post(API.sendAudio, fd, {
                    headers: {
                        'Content-Type': undefined
                    },
                    transformRequest: angular.identity,
                    params: fd
                })
            },

            // processGoogleSpeechPayload: function(jsonText, processFinalResultsFn, onTakeInterrimResultsFn){

            // },

            processDictatedText: function (text, isExtractMembershipNum) {
                var input = text.trim().toLowerCase();

                if (angular.isDefined(numberMap[input])) {
                    return numberMap[input];
                } else {
                    var clean = replaceAll(input, "reflex", "refax");
                    clean = replaceAll(clean, "refex", "refax");
                    clean = replaceAll(clean, "respect", "refax");

                    /**
                     * Convert colloquial way of saying numbers into digits. Possible cases
                     * - one, two, three ... nine
                     * - ten, twenty, thirty, fourty, fifty, sixty, seventy, eighty, ninety, one hundred
                     * - double [digit or ouh], triple [digit or ouh]
                     * - OUHs ("o" or "O") as zero, but only if it is adjacent to a number
                     */
                    clean = replaceAll(clean, "zero", "0");
                    clean = replaceAll(clean, "one", "1");
                    clean = replaceAll(clean, "two", "2");
                    clean = replaceAll(clean, "three", "3");
                    clean = replaceAll(clean, "four", "4");
                    clean = replaceAll(clean, "five", "5");
                    clean = replaceAll(clean, "six", "6");
                    clean = replaceAll(clean, "seven", "7");
                    clean = replaceAll(clean, "eight", "8");
                    clean = replaceAll(clean, "nine", "9");

                    clean = replaceAll(clean, "ten", "10");
                    clean = replaceAll(clean, "twenty", "20");
                    clean = replaceAll(clean, "thirty", "30");
                    clean = replaceAll(clean, "fourty", "40");
                    clean = replaceAll(clean, "fifty", "50");
                    clean = replaceAll(clean, "sixty", "60");
                    clean = replaceAll(clean, "seventy", "70");
                    clean = replaceAll(clean, "eighty", "80");
                    clean = replaceAll(clean, "ninety", "90");
                    clean = replaceAll(clean, "one hundred", "100");
                    clean = replaceAll(clean, "hundred", "100");

                    console.log("passed digit filter", clean);

                    //handle double and triple
                    clean = UtilityService
                        .matchThenReplace(clean, /\b(double|triple)\s+(\d|oh|o)/gi, function (matchedStr) {
                            //get the digit
                            var temp = matchedStr;
                            temp = temp.replace("double", "");
                            temp = temp.replace("triple", "");
                            temp = temp.trim();

                            var digit = temp.match(/^\d|oh|o/i)[0];

                            if (digit.toLowerCase() === "o" || digit.toLowerCase() === "oh") {
                                digit = "0";
                            }

                            //binary outcome, since either double or triple must exist in the string
                            var times = matchedStr.match(/double/i) ? 2 : 3;

                            return digit.repeat(times);
                        });

                    clean = replaceAll(clean, "doubletree", "33");
                    clean = replaceAll(clean, "double tree", "33");
                    clean = replaceAll(clean, "double for", "44");


                    /**
                     * Handle 'oh' that are adjacent to numbers
                     * NOTE: this will make 'pharaoh 12' --> 'phara0 12'
                     * But words that end/start with 'oh' are very rare and even rarer in business context
                     */

                    // '123 oh' --> 123 0
                    clean = UtilityService
                        .matchThenReplace(clean, /\d+\s+(oh)/gi, function (matchedStr) {
                            matchedStr = matchedStr.replace("oh", "0");
                            return matchedStr;
                        });

                    // `oh 123` --> 0 123
                    clean = UtilityService
                        .matchThenReplace(clean, /(oh)\s+\d+/gi, function (matchedStr) {
                            matchedStr = matchedStr.replace("oh", "0");
                            return matchedStr;
                        });


                    /**
                     * For long strings of numbers, google likes to think they are phone numbers
                     * and format them like +65-1234-2323. 
                     * Clean away any '+' and '-' from matching patterns
                     */
                    clean = UtilityService.matchThenReplace(clean, /(\d|\+|-)+/g, function (matchedStr) {
                        matchedStr = replaceAll(matchedStr, "-", "");
                        matchedStr = matchedStr.replace("+", "");
                        return matchedStr;
                    });

                    /**
                     * Find digits seperated by white space, and concat them           
                     */
                    clean = UtilityService.matchThenReplace(clean, /\d\s+\d/g, function (matchedStr) {
                        matchedStr = replaceAll(matchedStr, " ", "");
                        return matchedStr;
                    });

                    /**** DIGITS SHOULD NOT BE IN NUMERALS AND NOT WORDS AT THIS POINT ****/

                    /**
                     * If any string only contains only numbers / whitespace / "-"
                     * clean whitespace and "-" away 
                     */
                    if (/^(\d|\s|-)*$/.test(clean)) {
                        console.log('String only contains only numbers / whitespace / "-"');
                        clean = clean.replace(/\s/g, '');
                        clean = clean.replace(/-/g, '');
                    }

                    /**
                     * Extract the membership number only if requested
                     * 'uhm wait ok it is 2999923423 ahem 123123' --> '2999923423' 
                     * -- if two numbers are found, take the longer one
                     * -- whitespaces in between will be cleaned in next step
                     */
                    if (isExtractMembershipNum) {
                        var matches = clean.match(/\b\d(\d|\s|-|\+)*\b/g);

                        if (angular.isArray(matches) && matches.length) {
                            //pattern may take one whitespace at the end of the string. trim away first 
                            matches.map(function (str) {
                                str = str.replace(/s/g, ""); //replace the white spaces
                                return str.trim();
                            });
                            //find the longest matching consecutive string
                            var longestNumber = _.maxBy(matches, _.size);
                            LoggerPanelService.info("Extracted Membership No: " + longestNumber);
                            clean = longestNumber;
                        } else {
                            LoggerPanelService.log("Dictation did not contain a possible Membership No.");
                            return "";
                        }
                    }

                    // -- CLEANING FNS BELOW HAVE HIGHER CHANCE TO CAUSE FALSE NEGATIVES -- //

                    // Assume that if 'to' appears in between 2 digits, user was likely saying '2'
                    // cannot check for left/right adjacent like we did for 'oh' since too many words start/end with to
                    // 1 to 3 ---> 123
                    clean = UtilityService.matchThenReplace(clean, /\d\sto\s\d/g, function (matchedStr) {
                        matchedStr = matchedStr.replace("to", "2");
                        matchedStr = replaceAll(matchedStr, " ", "");
                        return matchedStr;
                    });

                    return clean;
                }


            }
        }
    }
})();

(function () {
    'use strict';
    angular
        .module('iconverse')
        .factory('UtilityService', UtilityService);

    UtilityService.$inject = [];

    function UtilityService() {

        return {
            replaceAll: function (str, search, replacement) {
                return str.replace(new RegExp("\\b" + search + "\\b", 'g'), replacement);
            },

            //L2703563 --> L-2-0-3-5-6-3
            interleaveText: function (str, separator) {
                if (!separator) separator = "";
                str = str.replace(/(.{1})/g, "$1" + separator);
                str = str.substring(0, str.length - separator.length); //remove extra separator at the end
                return str;
            },

            //Note: replaceFn must return a string to replace the passed in matchStr
            matchThenReplace: function (str, regex, replaceFn) {
                if (!str) return;
                var matches = str.match(regex);
                angular.forEach(matches, function (matchStr) {
                    str = str.replace(matchStr, replaceFn(matchStr));
                });
                return str;
            }
        }
    }
})();

(function () {
    'use strict';
    angular
        .module('iconverse')
        .factory('TextToSpeechService', TextToSpeechService);

    TextToSpeechService.$inject = ['UtilityService', '$log'];
    //Sdn Bhd- Sendirian Berhad
    function TextToSpeechService(UtilityService, $log) {

        // private fn that preprocesses text before passing to TTS
        function preprocessText(text) {

            /**
             * Find GL numbers like: L2703563 (L followed by 7 digits)
             * For each of these numbers, replace with an interleaved version (e.g. L-2-0-3-5-6-3)
             */
            text = UtilityService.matchThenReplace(text, /L\d{7}/gi, function (matchedStr) {
                return UtilityService.interleaveText(matchedStr, "-");
            });

            // convert "1:28 AM" to "1 28 AM"
            text = UtilityService.matchThenReplace(text, /\d:\d\d [AP]M/gi, function (matchedStr) {
                return matchedStr.replace(":", " ");
            });

            return text;
        }

        return {
            speak: function (text, opts) {
                text = preprocessText(text);

                $log.log('TTS Speaking: ' + text);

                responsiveVoice.speak(text, "UK English Female", opts);
            },
            isPlaying: function () {
                return responsiveVoice.isPlaying();
            },
            cancel: function () {
                responsiveVoice.cancel();
            },
            cancelIfPlaying: function () {
                if (this.isPlaying()) {
                    this.cancel();
                }
            }
        }
    }
})();

(function () {
    'use strict';
    angular
        .module('iconverse')
        .factory('IconverseService', IconverseService);

    IconverseService.$inject = ['$http'];

    function IconverseService($http) {

        var MOCK_API = {
            startSession: "http://demo4548247.mockable.io/startSession",
            sendMessage: "http://demo4548247.mockable.io/message",
        };

        //****** SET ICONVERSE BACKEND API PATH HERE ***** //
        var server = "/iconverse-converse"; //when deploying to AWS or AIA's server

        //var server = "https://aia-dev.taiger.com:443/iconverse-converse"; //local development

        //var server = "http://localhost:8081/iconverse-converse"

        //var server = "http://demo9524845.mockable.io"

        var API = {
            startSession: server + "/startSession",
            sendMessage: server + "/message",
        };

        return {
            startSession: function () {
                return $http({
                    url: API.startSession,
                    method: 'POST',
                    // as the server responds a non-json text string,
                    // we need to specify `transformResponse` to bypass angular's
                    // response handling (which assumes response is in JSON)          
                    transformResponse: [function (data) {
                        return data;
          }]
                });
            },

            sendMessage: function (message) {
                console.log('sending', message);
                return $http({
                    url: API.sendMessage,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: message
                }).then(function (response) {

                    //TODO: some post processing here to transform the received message
                    //GOAL - decouple controller&template from the iconverse server response
                    return response.data;
                })
            },

        }
    }
})();

(function () {
    'use strict';
    angular
        .module('aiaVaUi')
        .factory('DocumentParserService', DocumentParserService);

    DocumentParserService.$inject = ['$http', '$q', '$timeout', '$firebaseArray', '$firebaseObject'];

    /**
     * Mock Service will always expect:
     * - Each message should have a unique `id` 
     * - Each message sent from client should contain a `nextMsgId`, 
     *   specifying the `id` of the message the service should reply
     * - 
     */

    function DocumentParserService($http, $q, $timeout, $firebaseArray, $firebaseObject) {

        //var firebaseDB = "/v1";
        var firebaseDB = "/cc-apply";

        var firebaseUrl = "https://imatch-demos.firebaseio.com" + firebaseDB;

        // master list of documents and metadata
        var resourceUrl = firebaseUrl + "/master.json";

        var workingDocsPath = "/working_documents";


        // transient, working list of documents and meta
        var workingDocumentsUrl = firebaseUrl + workingDocsPath;
        var workingDocumentJson = workingDocumentsUrl + ".json";

        // working document ref
        var workingDocsRef = firebase.database().ref(firebaseDB + workingDocsPath);

        return {

            setWorkingDocSubPath: function (username) {
                workingDocumentsUrl = firebaseUrl + workingDocsPath + "/" + username;
                workingDocumentJson = workingDocumentsUrl + ".json";

                // working document ref
                workingDocsRef = firebase.database().ref(firebaseDB + workingDocsPath + "/" + username);

                console.log('set working doc path: ' + workingDocumentsUrl)
            },

            getDocumentKey: function (doc) {
                var self = this;

                var deferred = $q.defer();

                console.log('saving to firebase');

                // get the metadata
                self.getMetadataByDocumentName(doc.filename)
                    .then(function (metadata) {
                        doc.timestamp = new Date();
                        doc.metadata = metadata;
                        doc.hasLoaded = true;

                        //save the document with the metadata
                        return $http.post(workingDocumentJson, doc)
                    })
                    .then(function (res) {
                        console.log(res.data)
                        deferred.resolve(res.data.name); //the firebase key is returned
                    });

                return deferred.promise;
            },

            getWorkingDocuments: function () {
                var deferred = $q.defer();

                $http.get(workingDocumentJson)
                    .then(function (res) {
                        deferred.resolve(res.data);
                    });

                return deferred.promise;
            },

            clearWorkingDocuments: function () {
                console.log(workingDocsRef);
                var list = $firebaseArray(workingDocsRef);

                return this.getWorkingDocuments()
                    .then(function (docs) {

                        var ids = _.keys(docs);

                        console.log(ids);

                        var proms = ids.map(function (id) {
                            return list.$remove(list.$getRecord(id));
                        });

                        return $q.all(proms);
                    });

            },

            confirmExtractedResultsForDocument: function (key) {
                return $http.patch(workingDocumentsUrl + '/' + key + ".json", {
                    isConfirmed: true
                })
            },

            bindWorkingDocuments: function (scope, propertyName, onArrayChangedFn) {
                var query = workingDocsRef.orderByChild("timestamp")
                scope[propertyName] = $firebaseArray(query);

                if (angular.isFunction(onArrayChangedFn)) {
                    scope[propertyName].$watch(onArrayChangedFn);
                }

                return scope[propertyName];
            },

            bindToWorkingDocument: function (key, scope, propertyName) {
                var wDocRef = workingDocsRef.child(key);
                scope[propertyName] = $firebaseObject(wDocRef);
            },

            bindToWorkingDocumentMetadata: function (key, scope, propertyName) {
                var wDocRef = workingDocsRef.child(key).child('metadata');
                scope[propertyName] = $firebaseObject(wDocRef);
            },

            bindToWorkingDocumentDatapoints: function (key, scope, propertyName) {
                var wDocRef = workingDocsRef.child(key).child('metadata').child('datapoints');
                scope[propertyName] = $firebaseArray(wDocRef);
            },

            getMetadataByDocumentName: function (filename) {

                return $http.get(resourceUrl)
                    .then(function (res) {
                        var found = _.find(res.data, function (doc) {
                            return doc.filename == filename;
                        })

                        if (!found) {
                            console.error("No Metadata was detected for this file");
                        } else {
                            return found.metadata;
                        }

                    });
            },

            getWorkingDocumentByKey: function (documentKey) {
                var deferred = $q.defer();

                $http.get(workingDocumentsUrl + '/' + documentKey + ".json")
                    .then(function (res) {
                        console.log(res);
                        var data = res.data;

                        $timeout(function () {
                            deferred.resolve(data);
                        }, 1200)

                    });

                return deferred.promise;
            }

        }
    }
})();

(function () {
    'use strict';
    angular
        .module('iconverse')
        .factory('AudioStreamingService', AudioStreamingService);

    AudioStreamingService.$inject = ['UtilityService', '$log', 'VoiceRecognitionService',
  '$q', '$timeout'];

    function AudioStreamingService(UtilityService, $log, VoiceRecognitionService,
        $q, $timeout) {

        var self = this;

        // private vars
        var _mediaRecorder;
        var _websocket;

        var _wsResetTimer; // managing reset websocket at intervals

        // setup websocket vars
        var _wsPath = VoiceRecognitionService.getWebsocketPath();
        var _wsSingleUtterancePath = _wsPath + "/binary";
        var _wsLongUtterancePath = _wsPath + "/speechLongUtterance";

        //config vars - to be initialized by external context
        var _resetWebsocketInterval;
        var _onWebsocketDataReceivedFn;
        var _onWebsocketFinalDataReceivedFn;
        var _beforeWebsocketResetFn;

        /**
         * Configure and initialize the MediaStreamRecorder(MSR) library
         * Additionally, note that we start the MSR recording and place it in a paused state
         * for faster audio recording start via the #resume method (#resume is faster than $start)
         */
        var mediaConstraints = {
            audio: true
        };
        var frameSize = 100; // 100ms is recommended "a good tradeoff between latency and efficiency."
        var _isMsrInitialized; // true if we placed the MSR in paused state.

        function onMediaSuccess(stream) {
            _mediaRecorder = new MediaStreamRecorder(stream);
            _mediaRecorder.recorderType = StereoAudioRecorder;
            _mediaRecorder.audioChannels = 1;
            _mediaRecorder.sampleRate = 44100; //tested lower rates... this is the only sample rate that works
            _mediaRecorder.mimeType = 'audio/wav'; // check this line for audio/wav      

            // when audio data is received, pipe to the websocket
            // assumes that the ws is open
            _mediaRecorder.ondataavailable = function (blob) {

                if (_isMsrInitialized) {
                    _websocket.send(blob);
                } else {
                    // if false, then this execution is an initial start and audio data should be discarded
                    // place the msr in paused state for faster audio recording start
                    _mediaRecorder.pause();
                    _isMsrInitialized = true; //flip the flag
                    $log.log('MSR init complete');
                }
            };

            // initialize the msr
            _mediaRecorder.start(frameSize);
            $log.log('init MSR...');

        }

        function onMediaError(e) {
            $log.error(e);
        }

        // init the mediaRecorder
        // note: audio is only recorded after we call #start/#resume on mediaRecorder
        navigator.getUserMedia(mediaConstraints, onMediaSuccess, onMediaError);


        /**
         * Private method that opens the websocket connection
         */
        function _openWebsocket(isLongUtterance) {
            var deferred = $q.defer();

            var path = isLongUtterance ? _wsLongUtterancePath : _wsSingleUtterancePath;

            _websocket = new WebSocket(path);
            _websocket.binaryData = "blob";

            _websocket.onopen = function () {
                $log.log('websocket connection open! ' + (isLongUtterance ? '(LongUtterance)' : '(SingleUtterance)'));
                deferred.resolve()
            };

            _websocket.onerror = function (event) {
                $log.error('unexpected websocket error or was forcefully closed', event);
                deferred.reject(event);
            }

            var _this = this;

            _websocket.onmessage = function (e) {
                var blob = e.data;
                var reader = new FileReader();
                reader.onload = function () {
                    var text = reader.result;
                    _onWebsocketDataReceivedFn(text);
                };
                reader.readAsText(blob);
            }

            return deferred.promise;
        }

        // public methods
        return {
            isWebsocketOpen: function () {
                return _websocket && _websocket.readyState === _websocket.OPEN;
                //note: it can be one of the following values : CONNECTING, OPEN, CLOSING or CLOSED
            },

            init: function (resetIntervalMs, onDataReceivedFn, beforeResetFn) {
                _resetWebsocketInterval = resetIntervalMs;
                _onWebsocketDataReceivedFn = onDataReceivedFn;
                _beforeWebsocketResetFn = beforeResetFn;
                $log.log('AudioStreamingService init!')
            },

            // if isLongUtterance is true, it will reopen the websocket the first time
            // but subsequent times will default back to single utterance
            resetWebsocket: function (isLongUtterance) {
                this.stop();

                if (angular.isFunction(_beforeWebsocketResetFn)) {
                    _beforeWebsocketResetFn();
                }

                var self = this;

                //open it and resume the stream 
                return _openWebsocket(isLongUtterance).then(function () {
                    //after the websocket has opened, resume audio capture
                    _mediaRecorder.resume();

                    //reset the websocket connection after an interval
                    $log.log("resetting WS in " + _resetWebsocketInterval + " ms");

                    _wsResetTimer = $timeout(function () {
                        $log.log("resetting WS!")
                        self.resetWebsocket();
                    }, _resetWebsocketInterval)
                });
            },
            /**
             * Starts the audio stream to the server, handling the Websocket and MediaStreamRecorder internally.         
             * If the Websocket is not open, open it
             * else, close and reopen it 
             */
            start: function (isLongUtterance) {
                return this.resetWebsocket(isLongUtterance);
            },

            stop: function () {
                //if the websocket is open, close it and pause audio capture
                if (this.isWebsocketOpen()) {
                    _websocket.close();
                    _mediaRecorder.pause();
                    $log.log("closing WS & pausing mediaRecorder")

                    // cancel any queued up websocket reset instruction
                    var task = $timeout.cancel(_wsResetTimer);

                    console.log('did stop next run: ' + task);
                }
            }
        }
    }
})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .controller('PersistantStreamingWithChunksController', PersistantStreamingController);

    /** @ngInject */
    function PersistantStreamingController($timeout, webDevTec,
        toastr, ChatService, $scope, AudioStreamingService,
        VoiceRecognitionService, TextToSpeechService) {
        var vm = this;

        //because the UI is being shared between 2 controllers,
        //lets differentiate the by passing a variable into the template
        vm.versionName = "Demo 5";
        vm.versionSub = "Persistent Audio Streaming";
        vm.versionNum = "1.3.0";

        vm.noAudioDetectedCount = 0;
        var MAX_NO_AUDIO_COUNT = 4; // 8 - 10s between each audio detection
        var MAX_MEMBERSHIP_NUM_CHARS = 14;

        var membershipNumBuffer = "";
        var membershipNumberDictationFailedCount = 0;
        var MAX_MEMBERSHIP_DICTATION_FAILED = 4;

        ChatService.bindConversation(vm, 'conversation');


        var processFinalResults = function (result) {
            if (!result.transcript) return; //TODO: check why null is sometimes passed in

            cancelInterrimResultTimer();

            vm.latestInterrimTranscript = null; //clear buffer  

            vm.logPanel.success('processing results: ' + result.transcript);

            // if we are expecting membership number, additional logic is needed to check / buffer
            // the member ID. If sufficient length, or if failed to dictate too many times, then
            // we will send whatever is in the buffer to iconverse
            if (vm.isExpectingMembershipNumber) {
                cancelMembershipTimer(); // cancel the timer that would trigger sending in a period of silence

                // extract the member ID. this function returns an empty string if no memberID pattern could be detected
                var input = VoiceRecognitionService.processDictatedText(result.transcript, true);

                membershipNumBuffer += input;

                vm.textInput = membershipNumBuffer;

                // if no memberID could be extracted, increment the count
                if (!input) {
                    membershipNumberDictationFailedCount++;
                    vm.logPanel.info("No digits to add to MemberID buffer (" + membershipNumberDictationFailedCount + " of " + MAX_MEMBERSHIP_DICTATION_FAILED + " tries)");
                }

                vm.logPanel.log("MemberID buffer: " + membershipNumBuffer);

                // if the membership number has not exceeded the max number
                if (membershipNumBuffer.length <= MAX_MEMBERSHIP_NUM_CHARS) {
                    //listen for more if max tries threshold has not passed
                    if (membershipNumberDictationFailedCount <= MAX_MEMBERSHIP_DICTATION_FAILED) {
                        vm.logPanel.info("MemberID too short. Listening for more.");

                        if (membershipNumBuffer) takeMembershipNumBufferAfter(4000);

                        return;
                    } else if (membershipNumBuffer) {
                        vm.logPanel.info("Failed to evaluate member ID, sending whatever we have in the buffer");
                        input = membershipNumBuffer;
                    } else {
                        vm.logPanel.info("Failed to evaluate member ID, sending NoInput");
                        input = "NoInput"; // hardcode a response to iconverse  
                    }
                } else {
                    vm.logPanel.info("MemberID is sufficient length!");
                    input = membershipNumBuffer; //set response to iconverse as buffer contents
                }

                //if reached here, we will send what is in the buffer to iconverse
                vm.handleVoiceRecognitionResults({
                    transcript: membershipNumBuffer
                });
                didProcessMembershipNumber();
            }
            // if not expecting membership number, process directly
            else {
                vm.handleVoiceRecognitionResults(result);
            }

        }

        var interrimResultTimer;
        var takeInterrimResultsAfter = function (ms) {
            vm.logPanel.log('Using interrim transcript in buffer after ' + ms + ' ms');
            interrimResultTimer = $timeout(function () {
                AudioStreamingService.resetWebsocket()
                processFinalResults({
                    transcript: vm.latestInterrimTranscript
                })
            }, ms);
        }

        var cancelInterrimResultTimer = function () {
            if (interrimResultTimer) {
                $timeout.cancel(interrimResultTimer);
                vm.logPanel.log('interrim result timer cancelled');
                interrimResultTimer = null;
            }
        }

        var membershipNumBufferTimer;
        var takeMembershipNumBufferAfter = function (ms) {
            cancelMembershipTimer(); //cancel any previously queued
            vm.logPanel.log('Using membership number in buffer after ' + ms + ' ms');
            membershipNumBufferTimer = $timeout(function () {
                AudioStreamingService.resetWebsocket();
                vm.handleVoiceRecognitionResults({
                    transcript: membershipNumBuffer
                });
                didProcessMembershipNumber();
            }, ms);
        }

        var cancelMembershipTimer = function () {
            if (membershipNumBufferTimer) {
                $timeout.cancel(membershipNumBufferTimer);
                vm.logPanel.log('membership buffer result timer cancelled');
                membershipNumBufferTimer = null;
            }
        }


        //Initialize Audio Streaming Service
        var onWebsocketData = function (jsonText) {
            var result = JSON.parse(jsonText);

            // IMPT: once END_OF_UTTERANCE is arrived, google will not process
            // any new audio until gRPC session is refreshed (websocket is reset)
            if (result.endpointerType === 'END_OF_UTTERANCE') {
                vm.logPanel.log('No audio detected.');

                // if we are currently expecting member ID, 
                // and there is content in the membershipNumBuffer
                if (vm.isExpectingMembershipNumber) {
                    cancelMembershipTimer();

                    if (membershipNumBuffer) {
                        takeMembershipNumBufferAfter(3000);
                        return;
                    }

                }

                vm.logPanel.log('Waiting ' + (MAX_NO_AUDIO_COUNT - vm.noAudioDetectedCount) + ' checks before shutdown.');

                // if there is intterrim transcript, 
                if (vm.latestInterrimTranscript) {

                    // if the interrim text contains 'Yes' or 'No', process immediately
                    if (/\b(yes|no|okay)\b/i.test(vm.latestInterrimTranscript)) {
                        takeInterrimResultsAfter(0);
                    } else {
                        // else, take it as final it after x ms
                        takeInterrimResultsAfter(3000);
                    }
                }
                // kill if no audio count has exceeded limit and nothing is queued 
                // in the interrim
                else if (
                    ++vm.noAudioDetectedCount > MAX_NO_AUDIO_COUNT &&
                    !interrimResultTimer) {
                    vm.stop(); //stop the call
                    vm.noAudioDetectedCount = 0; //reset the count
                } else {
                    // if not, then reset the websocket to refresh the google speech session
                    AudioStreamingService.resetWebsocket();
                }

            }

            if (result.transcript) {
                vm.noAudioDetectedCount = 0; //reset the count

                if (result.final) {
                    vm.logPanel.success('final transcript: ' + result.transcript);
                    vm.textInput = result.transcript;

                    processFinalResults(result);

                    AudioStreamingService.resetWebsocket();
                } else {
                    vm.logPanel.log('interrim transcript: ' + result.transcript);
                    vm.textInput = result.transcript;

                    vm.latestInterrimTranscript = result.transcript;
                }
            }

        }

        var beforeWebsocketReset = function () {
            //before resetting, process the interrim data, if any
            if (vm.latestInterrimTranscript) {
                vm.logPanel.log('websocket is closing! taking transcript in buffer: ' + vm.latestInterrimTranscript);
                processFinalResults({
                    transcript: vm.latestInterrimTranscript
                })
            }
        }

        AudioStreamingService.init(55 * 1000, onWebsocketData, beforeWebsocketReset);


        vm.startStreaming = function () {
            AudioStreamingService.start()
                .then(function () {
                    vm.logPanel.success("Audio streaming started")
                })
        }

        vm.stop = function () {
            AudioStreamingService.stop();
            TextToSpeechService.cancelIfPlaying();
            reset();
            vm.logPanel.log("Audio streaming stopped");
        }

        /**
         * CHAT FUNCTIONS
         */

        var reset = function () {
            vm.state = "IDLE"; //["RECORDING"]
        }
        reset(); //initialize

        vm.initialStart = function () {
            vm.logPanel.log('sending start message to initialize...');
            vm.state = "RECORDING";

            vm.startStreaming();

            ChatService.processUserMessage("start", null, null, null, true)
                .then(function (replyMsg) {
                    vm.logPanel.success('chat session initialized');

                    handleChatResponse(replyMsg);
                });
        }

        var handleChatResponse = function (msg) {
            var text = msg.text;

            vm.isExpectingMembershipNumber = msg.state === "PromptMemberId";
            if (vm.isExpectingMembershipNumber) {
                vm.logPanel.info("Expecting user to reply with membership number...");
            }

            TextToSpeechService.speak(text, {
                onstart: function () {
                    vm.logPanel.log("TTS started");
                    $scope.$apply();
                },
                onend: function () {
                    vm.logPanel.log("TTS ended");
                    $scope.$apply();
                },
                onerror: function () {
                    vm.state = "IDLE";
                    vm.errorType = "TTS_ERROR"
                    vm.logPanel.error("TTS error");
                    vm.isErrored = true;
                    vm.stop();
                    $scope.$apply();
                }
            });
        }

        var didProcessMembershipNumber = function () {
            vm.isExpectingMembershipNumber = false;
            membershipNumBuffer = "";
            membershipNumberDictationFailedCount = 0;
        }

        vm.handleVoiceRecognitionResults = function (result) {
            //if the voice is speaking, stop speaking
            TextToSpeechService.cancelIfPlaying();

            var text = result.transcript;
            var input = VoiceRecognitionService.processDictatedText(text, vm.isExpectingMembershipNumber);

            vm.textInput = ""; //clear visual aid

            vm.logPanel.log('Sending to iconverse server: ' + input);

            ChatService.processUserMessage(input)
                .then(function (replyMsg) {
                    handleChatResponse(replyMsg);
                });

        }

        vm.sendTextMsg = function () {
            if (vm.textInput) {
                var text = vm.textInput;

                vm.textInput = ""; //clear the input    

                //if the voice is speaking, stop speaking
                TextToSpeechService.cancelIfPlaying();

                //send the message
                ChatService.processUserMessage(text)
                    .then(function (replyMsg) {
                        handleChatResponse(replyMsg);
                    });
            }
        }

        $scope.$watch('vm.vrTestInput', function (val) {
            if (val) {
                var input = VoiceRecognitionService.processDictatedText(val);
                console.log("output: " + input);
            }
        });


        //Text Web Socket Connection for testing
        var checkMsg = "Websocket is working!";
        var tws = new WebSocket(VoiceRecognitionService.getWebsocketPath() + "/text");
        tws.onopen = function () {
            vm.logPanel.log("Text WS opened. Performing self-check...");
            tws.send(checkMsg);
        };
        tws.onclose = function () {
            vm.logPanel.log("Text WS closed");
        };
        tws.onerror = function (e) {
            vm.logPanel.error("Text WS failed with error", e);
        };
        tws.onmessage = function (e) {
            console.log("TWS: " + e.data);
            var resp = JSON.parse(e.data)
            if (resp.success && checkMsg === resp.msg) {
                tws.close();
                vm.logPanel.success("Websocket test success...")
            }
        };

    }
})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .controller('PersistantStreamingController', PersistantStreamingController);

    /** @ngInject */
    function PersistantStreamingController($timeout, webDevTec,
        toastr, ChatService, $scope, AudioStreamingService,
        VoiceRecognitionService, TextToSpeechService, $interval) {
        var vm = this;

        var isStopped = true;

        //because the UI is being shared between 2 controllers,
        //lets differentiate the by passing a variable into the template
        vm.versionName = "Demo 6";
        vm.versionSub = "Persistent Audio Streaming + Wait For Membership No.";
        vm.versionNum = "1.1.2";

        vm.noAudioDetectedCount = 0;
        var MAX_NO_AUDIO_COUNT = 4; // 8 - 10s between each audio detection    

        var MAX_MEMBERSHIP_NUM_CHARS = 14;
        var lastMembershipNumChangeTime;
        var MAX_MEMBERSHIP_NUM_WAIT_TIME = 13000; // wait time if nothing is heard while waiting for membership number (INCLUDES TTS time)
        var MAX_MEMBERSHIP_NUM_WAIT_TIME_BETWEEN_VALID_DICTATION = 3000; // wait time between each valid membership dictation 

        var ttsLastEndedTime;
        var MIN_WAIT_AFTER_TTS_BEFORE_SENDING_NO_RESPONSE = 3000;

        ChatService.bindConversation(vm, 'conversation');


        var processFinalResults = function (result) {
            if (!result.transcript) return; //TODO: check why null is sometimes passed in

            cancelInterrimResultTimer();
            vm.logPanel.success('processing results: ' + result.transcript);
            vm.handleVoiceRecognitionResults(result);

            vm.latestInterrimTranscript = null; //clear buffer                     
        }

        var interrimResultTimer;
        var takeInterrimResultsAfter = function (ms) {
            vm.logPanel.log('Using interrim transcript in buffer after ' + ms + ' ms');
            interrimResultTimer = $timeout(function () {
                AudioStreamingService.resetWebsocket()
                processFinalResults({
                    transcript: vm.latestInterrimTranscript
                })
            }, ms);
        }

        var cancelInterrimResultTimer = function () {
            if (interrimResultTimer) {
                $timeout.cancel(interrimResultTimer);
                vm.logPanel.log('interrim result timer cancelled');
                interrimResultTimer = null;
            }
        }


        //Initialize Audio Streaming Service
        var onWebsocketData = function (jsonText) {
            //prevent zombie start
            if (vm.state === "IDLE") {
                vm.stop();
                return;
            }

            console.log(jsonText);
            var result = JSON.parse(jsonText);

            // IMPT: once END_OF_UTTERANCE is arrived, google will not process
            // any new audio until gRPC session is refreshed (websocket is reset)
            // NOTE: END_OF_UTTERANCE will not be reached when currently in longUtterance mode (in other words, when vm.isExpectingMembershipNumber = true)
            if (result.endpointerType === 'END_OF_UTTERANCE') {
                vm.logPanel.log('No audio detected. Waiting ' + (MAX_NO_AUDIO_COUNT - vm.noAudioDetectedCount) + ' checks before shutdown.');

                // if there is intterrim transcript, 
                if (vm.latestInterrimTranscript) {

                    // if the interrim text contains 'Yes' or 'No', process immediately
                    if (/\b(yes|no|okay)\b/i.test(vm.latestInterrimTranscript)) {
                        takeInterrimResultsAfter(0);
                    } else {
                        // else, take it as final it after x ms
                        takeInterrimResultsAfter(3000);
                    }
                }
                // kill if no audio count has exceeded limit and nothing is queued 
                // in the interrim
                else if (
                    ++vm.noAudioDetectedCount > MAX_NO_AUDIO_COUNT &&
                    !interrimResultTimer) {
                    vm.stop(); //stop the call
                } else {
                    // send no response to the server 
                    // unless TTS is is still playing (user may still be listening to TTS talk)
                    var ttsEndedAge = new Date().getTime() - ttsLastEndedTime;
                    var ttsCheck = !ttsLastEndedTime || (ttsEndedAge > MIN_WAIT_AFTER_TTS_BEFORE_SENDING_NO_RESPONSE)
                    if (!TextToSpeechService.isPlaying() && ttsCheck) {
                        sendNoResponseMsg();
                    } else {
                        vm.logPanel.info("Not sending no response msg since TTS is speaking or tts had ended less than " + MIN_WAIT_AFTER_TTS_BEFORE_SENDING_NO_RESPONSE + " ms ago");
                    }

                    // reset the websocket to refresh the google speech session
                    AudioStreamingService.resetWebsocket();
                }

            }


            if (vm.isExpectingMembershipNumber) {
                var membershipNo = VoiceRecognitionService.processDictatedText(result.transcript, true);
                vm.textInput = membershipNo;

                lastMembershipNumChangeTime = new Date().getTime();

                if (membershipNo && membershipNo.length >= MAX_MEMBERSHIP_NUM_CHARS) {
                    resetMembershipChecker();
                    vm.logPanel.info("MemberID is sufficient length!");
                    vm.handleVoiceRecognitionResults({
                        transcript: membershipNo
                    });
                    AudioStreamingService.resetWebsocket();
                }

            } else if (result.transcript) {
                vm.noAudioDetectedCount = 0; //reset the count

                if (result.final) {
                    vm.logPanel.success('final transcript: ' + result.transcript);
                    vm.textInput = result.transcript;

                    processFinalResults(result);

                    AudioStreamingService.resetWebsocket();
                } else {
                    vm.logPanel.log('interrim transcript: ' + result.transcript);
                    vm.textInput = result.transcript;

                    vm.latestInterrimTranscript = result.transcript;
                }
            }

        }

        /**
         * membershipCheckTimeoutFn is executed when the membership check has timed out
         */
        var membershipCheckTimeoutFn = function () {
            resetMembershipChecker();
            vm.logPanel.info("Waited too long for MemberID!");

            if (vm.textInput) {
                vm.logPanel.info("Sending text in buffer");
                vm.handleVoiceRecognitionResults({
                    transcript: vm.textInput
                });
            } else {
                sendNoResponseMsg();
            }

            AudioStreamingService.resetWebsocket();
        };

        /**
         * startMembershipCheckInterval(intervalMs) 
         * relies on: 
         * - vm.isExpectingMembershipNumber
         * - lastMembershipNumChangeTime
         * - startedWaitingForMembershipTime
         * sets up an interval that runs every intervalMs. At every interval, check whether should timeout
         */
        var membershipCheckInterval;
        var startedWaitingForMembershipTime;
        var startMembershipCheckInterval = function (intervalMs) {
            if (membershipCheckInterval) return; //don't run if already instantiated

            membershipCheckInterval = $interval(function () {
                var now = new Date().getTime();

                if (vm.isExpectingMembershipNumber) {

                    var isTimedOut = false;
                    var age;

                    if (!lastMembershipNumChangeTime) {
                        age = now - startedWaitingForMembershipTime;
                        isTimedOut = age > MAX_MEMBERSHIP_NUM_WAIT_TIME;
                        vm.secondsToTimeout = (MAX_MEMBERSHIP_NUM_WAIT_TIME - age) / 1000;
                        vm.logPanel.log("Membership Check Mode: TOTAL - " + vm.secondsToTimeout.toFixed(0) + "s before timeout");
                    } else {
                        age = now - lastMembershipNumChangeTime;
                        vm.secondsToTimeout = (MAX_MEMBERSHIP_NUM_WAIT_TIME_BETWEEN_VALID_DICTATION - age) / 1000;
                        isTimedOut = age > MAX_MEMBERSHIP_NUM_WAIT_TIME_BETWEEN_VALID_DICTATION;
                        vm.logPanel.log("Membership Check Mode: GAP - " + vm.secondsToTimeout.toFixed(0) + "s before timeout");
                    }

                    if (isTimedOut) {
                        vm.logPanel.info("Membership Check Timed Out");
                        membershipCheckTimeoutFn();
                    }

                }

            }, intervalMs)
        }

        startMembershipCheckInterval(1000); //init

        var resetMembershipChecker = function () {
            vm.logPanel.log("Stopped membership checker");
            vm.isExpectingMembershipNumber = false;
            lastMembershipNumChangeTime = null;
            startedWaitingForMembershipTime = null;
        }


        var beforeWebsocketReset = function () {
            //before resetting, process the interrim data, if any
            if (vm.latestInterrimTranscript) {
                vm.logPanel.log('websocket is closing! taking transcript in buffer: ' + vm.latestInterrimTranscript);
                processFinalResults({
                    transcript: vm.latestInterrimTranscript
                })
            }
        }

        AudioStreamingService.init(55 * 1000, onWebsocketData, beforeWebsocketReset);


        vm.startStreaming = function () {
            AudioStreamingService.start()
                .then(function () {
                    vm.logPanel.success("Audio streaming started")
                })
        }

        vm.stop = function () {
            AudioStreamingService.stop();
            TextToSpeechService.cancelIfPlaying();
            reset();
            resetMembershipChecker();
            vm.noAudioDetectedCount = 0; //reset the count
            vm.logPanel.log("Audio streaming stopped");
        }

        /**
         * CHAT FUNCTIONS
         */

        var reset = function () {
            vm.state = "IDLE"; //["RECORDING"]
        }
        reset(); //initialize

        vm.initialStart = function () {
            vm.logPanel.log('sending start message to initialize...');
            vm.state = "RECORDING";

            vm.startStreaming();

            ChatService.processUserMessage("start", null, null, null, true)
                .then(function (replyMsg) {
                    vm.logPanel.success('chat session initialized');

                    handleChatResponse(replyMsg);
                });
        }

        var sendNoResponseMsg = function () {
            vm.logPanel.log("sending no response message...")
            ChatService.processUserMessage("NoInput", "NoInput", null, null, true)
                .then(function (replyMsg) {
                    handleChatResponse(replyMsg);
                });
        }

        var handleChatResponse = function (msg) {
            var text = msg.text;

            vm.logPanel.info("Msg State: " + msg.state);
            if (msg.state === 'PromptMemberId') {
                vm.isExpectingMembershipNumber = true;
                startedWaitingForMembershipTime = new Date().getTime();
            } else if (msg.state === "Bye") {
                vm.logPanel.info("iconverse triggered session termination");
                TextToSpeechService.speak(text);
                vm.stop();
                return;
            } else {
                vm.isExpectingMembershipNumber = false;
            }

            AudioStreamingService.resetWebsocket(vm.isExpectingMembershipNumber);

            TextToSpeechService.speak(text, {
                onstart: function () {
                    vm.logPanel.log("TTS started");
                    $scope.$apply();
                },
                onend: function () {
                    vm.logPanel.log("TTS ended");

                    ttsLastEndedTime = new Date().getTime();

                    $scope.$apply();
                },
                onerror: function () {
                    vm.state = "IDLE";
                    vm.errorType = "TTS_ERROR"
                    vm.logPanel.error("TTS error");
                    vm.isErrored = true;
                    vm.stop();
                    $scope.$apply();
                }
            });
        }

        vm.handleVoiceRecognitionResults = function (result) {
            //if the voice is speaking, stop speaking
            TextToSpeechService.cancelIfPlaying();

            var text = result.transcript;
            var input = VoiceRecognitionService.processDictatedText(text);

            vm.textInput = ""; //clear visual aid

            vm.logPanel.log('Sending to iconverse server: ' + input);

            ChatService.processUserMessage(input)
                .then(function (replyMsg) {
                    handleChatResponse(replyMsg);
                });

        }

        vm.sendTextMsg = function () {
            if (vm.textInput) {
                var text = vm.textInput;

                vm.textInput = ""; //clear the input    

                //if the voice is speaking, stop speaking
                TextToSpeechService.cancelIfPlaying();

                //send the message
                ChatService.processUserMessage(text)
                    .then(function (replyMsg) {
                        handleChatResponse(replyMsg);
                    });
            }
        }

        $scope.$watch('vm.vrTestInput', function (val) {
            if (val) {
                var input = VoiceRecognitionService.processDictatedText(val, true);
                console.log("output: " + input);
            }
        });


        //Text Web Socket Connection for testing
        $timeout(function () {
            var checkMsg = "Websocket is working!";
            var tws = new WebSocket(VoiceRecognitionService.getWebsocketPath() + "/text");
            tws.onopen = function () {
                vm.logPanel.log("Text WS opened. Performing self-check...");
                tws.send(checkMsg);
            };
            tws.onclose = function () {
                vm.logPanel.log("Text WS closed");
            };
            tws.onerror = function (e) {
                vm.logPanel.error("Text WS failed with error", e);
            };
            tws.onmessage = function (e) {
                console.log("TWS: " + e.data);
                var resp = JSON.parse(e.data)
                if (resp.success && checkMsg === resp.msg) {
                    tws.close();
                    vm.logPanel.success("Websocket test success...")
                }
            };
        })

    }
})();



(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .controller('MediaStreamController', MediaStreamController);

    /** @ngInject */
    function MediaStreamController($timeout, webDevTec, toastr, ChatService, $scope, VoiceRecognitionService) {
        var vm = this;

        var mediaConstraints = {
            audio: true
        };

        navigator.getUserMedia(mediaConstraints, onMediaSuccess, onMediaError);

        function onMediaSuccess(stream) {
            var mediaRecorder = new MediaStreamRecorder(stream);
            mediaRecorder.audioChannels = 1;
            mediaRecorder.sampleRate = 16000;
            mediaRecorder.mimeType = 'audio/wav'; // check this line for audio/wav
            mediaRecorder.ondataavailable = function (blob) {
                // POST/PUT "Blob" using FormData/XHR2
                var blobURL = URL.createObjectURL(blob);
                document.write('<a href="' + blobURL + '">' + blobURL + '</a>');
            };
            mediaRecorder.start(1000);

            setTimeout(function () {
                mediaRecorder.stop();
            }, 20000)
        }

        function onMediaError(e) {
            console.error('media error', e);
        }



    }
})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .controller('SocketStreamingController', SocketStreamingController);

    /** @ngInject */
    function SocketStreamingController($timeout, webDevTec,
        toastr, ChatService, $scope,
        VoiceRecognitionService, TextToSpeechService) {
        var main = this;

        //because the UI is being shared between 2 controllers,
        //lets differentiate the by passing a variable into the template
        main.versionName = "Demo 4";
        main.versionSub = "Websocket Audio Streaming";
        main.versionNum = "1.2.1";

        ChatService.bindConversation(main, 'conversation');

        var reset = function () {
            main.state = "IDLE"; //["RECORDING", "PROCESSING"]
        }
        reset(); //initialize

        var mediaRecorder;
        var ws; //websocket

        // frame size of audio. 
        // Larger frames are more efficient, but add latency. 
        // 100ms is recommended "a good tradeoff between latency and efficiency."
        var frameSize = 100;

        var websocketPath = VoiceRecognitionService.getWebsocketPath(); //need to point this to speechserver's websocket

        /*** Setup voice recognition ***/
        var mediaConstraints = {
            audio: true
        };

        function onMediaSuccess(stream) {
            mediaRecorder = new MediaStreamRecorder(stream);
            mediaRecorder.recorderType = StereoAudioRecorder;
            mediaRecorder.audioChannels = 1;
            mediaRecorder.sampleRate = 44100; //tested lower rates... this is the only sample rate that works
            mediaRecorder.mimeType = 'audio/wav'; // check this line for audio/wav

            mediaRecorder.ondataavailable = function (blob) {
                ws.send(blob); // Blob object
            };
        }

        function onMediaError(e) {
            main.logPanel.error('media error', e);

            $timeout(function () {
                main.isErrored = true;
                main.errorType = "MIC_ERROR";
            })
        }

        navigator.getUserMedia(mediaConstraints, onMediaSuccess, onMediaError);


        /*** Setup Websocket Audio Streaming Functions ***/

        // openStream does the following:
        // 1. create the websocket connection
        // 2. When the websocket is opened
        //      if the stream is resuming, call #resume on mediaRecorder
        //      else, initialize mediaRecorder with #start
        main.openStream = function (isResuming) {
            ws = new WebSocket(websocketPath + "/binary");
            ws.binaryData = "blob";

            ws.onopen = function () {
                main.logPanel.success('websocket connection open!');

                // there is some delay in mediaRecorder startup 
                // it is especially heavy (~300-500ms) when calling #start
                var estMediaRecorderDelay = 0; //set to zero by default

                if (isResuming) {
                    $timeout(function () {
                        main.canRestart = false;
                    });

                    mediaRecorder.resume();
                    main.logPanel.info('mediaRecorder RESUMING: streaming audio at every ' + frameSize + " ms");
                } else {
                    mediaRecorder.start(frameSize);
                    estMediaRecorderDelay = 500;
                    main.logPanel.info('mediaRecorder START: streaming audio at every ' + frameSize + " ms");
                }

                //change state to recording 
                $timeout(function () {
                    main.state = "RECORDING";
                    main.logPanel.log("State changed to listening...");
                }, estMediaRecorderDelay); //buffer time for media recorder to start streaming

            };

            ws.onerror = function (event) {
                main.logPanel.error('unexpected websocket error or was forcefully closed', event);
                $timeout(function () {
                    //main.isErrored = true;
                    //main.errorType = "SPEECHSERVER_CONNECTION_ERROR";
                    main.stop(true); //if websocket throws, pause the streaming
                })
            }

            var pauseTimer;
            var startPauseTimer = function (ms) {
                main.logPanel.log('No interrim transcript in buffer. Pausing stream after: ' + ms + " ms");
                pauseTimer = $timeout(function () {
                    main.stop(true);
                }, ms);
            };

            var cancelPauseTimer = function () {
                if (pauseTimer) {
                    $timeout.cancel(pauseTimer);
                    main.logPanel.log('stop timer cancelled');
                }
            }

            var processFinalResults = function (result) {
                cancelPauseTimer();
                cancelInterrimResultTimer();
                main.handleVoiceRecognitionResults(result);
                main.latestInterrimTranscript = null; //clear buffer                     
                main.closeStream();
            }

            var interrimResultTimer;
            var takeInterrimResultsAfter = function (ms) {
                main.logPanel.log('Using interrim transcript in buffer after ' + ms + ' ms');
                interrimResultTimer = $timeout(function () {
                    processFinalResults({
                        transcript: main.latestInterrimTranscript
                    })
                }, ms);
            }

            var cancelInterrimResultTimer = function () {
                if (interrimResultTimer) {
                    $timeout.cancel(interrimResultTimer);
                    //main.logPanel.log('interrim result timer cancelled');
                }
            }


            var readResult = function (jsonText) {
                var result = JSON.parse(jsonText);

                // if result contains `endpointerType`, server is informing us of one of the following events:
                // taken from: https://cloud.google.com/speech/reference/rest/v1beta1/EndpointerType
                // START_OF_SPEECH - Speech has been detected in the audio stream.
                // END_OF_SPEECH - Speech has ceased to be detected in the audio stream.
                // END_OF_UTTERANCE - Utterance has ended. Server will not process additional audio. Client should stop sending additional data and wait for additional results, until server closes the gRPC connection.
                // END_OF_AUDIO - The end of the audio stream has been reached. and it is being processed.
                // ENDPOINTER_EVENT_UNSPECIFIED - probably an error has thrown in the server 

                //if voice is not speaking (we are waiting for user input and google tells us utterance or audio has ended)
                if (!TextToSpeechService.isPlaying() &&
                    (result.endpointerType === 'END_OF_UTTERANCE')) {
                    main.logPanel.log('No audio detected');


                    if (main.latestInterrimTranscript) {
                        //process interrim as final after xx ms
                        takeInterrimResultsAfter(3000);
                    } else {
                        // set to 'paused' state after 5000ms
                        startPauseTimer(5000);
                    }

                }

                if (result.transcript) {

                    if (result.final) {
                        main.logPanel.success('final transcript: ' + result.transcript);
                        main.textInput = result.transcript;

                        processFinalResults(result);
                    } else {
                        main.logPanel.log('interrim transcript: ' + result.transcript);
                        main.textInput = result.transcript;

                        main.latestInterrimTranscript = result.transcript;
                    }
                }


            }

            ws.onmessage = function (e) {
                var blob = e.data;
                var reader = new FileReader();
                reader.onload = function () {
                    var text = reader.result;
                    readResult(text);
                };
                reader.readAsText(blob);
            }
        }

        main.closeStream = function () {
            mediaRecorder.pause();
            ws.close();
        }

        var handleChatResponse = function (text) {
            TextToSpeechService.speak(text, {
                onstart: function () {
                    main.logPanel.log("TTS started");
                    main.state = "SPEAKING";
                    $scope.$apply();
                },
                onend: function () {
                    main.logPanel.log("TTS ended");
                    main.resume();
                    $scope.$apply();
                }
            });
        }

        main.handleVoiceRecognitionResults = function (result) {
            var text = result.transcript;
            var input = VoiceRecognitionService.processDictatedText(text);
            main.textInput = ""; //clear visual aid

            main.logPanel.log('Sending input to iconverse server: ' + input);

            ChatService.processUserMessage(input)
                .then(function (replyMsg) {
                    main.logPanel.success('Received response from iconverse server');
                    handleChatResponse(replyMsg.text);
                })
                .catch(function (errr) {
                    main.logPanel.error("Error when handling voice recognition results ", errr);
                    main.stop();
                    main.isErrored = true;
                });
        }


        main.stop = function (isPausing) {
            //if the voice is speaking, stop speaking
            TextToSpeechService.cancelIfPlaying();

            main.state = isPausing ? "PAUSED" : "IDLE";
            main.closeStream();

            main.canRestart = isPausing;

            if (!isPausing) {
                ChatService.clearConversationLog();
                ChatService.bindConversation(main, 'conversation');
            }

            main.logPanel.log("Stop was triggered");

        }

        main.resume = function () {
            main.state = "PREPARING";
            main.logPanel.log("Resume triggered, opening websocket");
            main.openStream(true);
        }

        main.initialStart = function () {
            main.logPanel.log('sending start message to initialize...');
            main.state = "STARTING";

            ChatService.processUserMessage("start", null, null, null, true)
                .then(function (replyMsg) {
                    main.logPanel.success('chat session initialized');

                    //replyMsg.text
                    TextToSpeechService.speak(replyMsg.text, {
                        onstart: function () {
                            main.logPanel.log("TTS started");
                            main.state = "SPEAKING";
                            $scope.$apply();
                        },
                        onend: function () {
                            main.logPanel.log("TTS ended.");
                            main.start();
                            $scope.$apply();
                        },
                        onerror: function () {
                            main.state = "IDLE";
                            main.errorType = "TTS_ERROR"
                            main.logPanel.error("TTS error");
                            main.isErrored = true;
                            main.stop();
                            $scope.$apply();
                        }
                    });
                })
                .catch(function (err) {
                    main.logPanel.error("Error at initial start", err);
                    main.state = "IDLE";
                    main.stop();
                    main.isErrored = true;
                })

        }

        main.start = function () {
            main.logPanel.log('start was triggered');
            main.state = "PREPARING";
            main.openStream();
            main.canRestart = false;
        }

        main.sendTextMsg = function () {
            if (main.textInput) {
                var text = main.textInput;

                main.textInput = ""; //clear the input    

                //if the voice is speaking, stop speaking
                TextToSpeechService.cancelIfPlaying();

                // if the recording is streaming, close the stream
                if (main.state === "RECORDING") {
                    main.closeStream();
                }

                //send the message
                ChatService.processUserMessage(text)
                    .then(function (replyMsg) {
                        handleChatResponse(replyMsg.text);
                    })
                    .catch(function (e) {
                        main.logPanel.error("Error when sending message in text", e);
                    });
            }
        }

        //Text Web Socket Connection for testing
        var checkMsg = "Websocket is working!";
        var tws = new WebSocket(websocketPath + "/text");
        tws.onopen = function () {
            main.logPanel.log("Text WS opened. Performing self-check...");
            tws.send(checkMsg);
        };
        tws.onclose = function () {
            main.logPanel.log("Text WS closed");
        };
        tws.onerror = function (e) {
            main.logPanel.error("Text WS failed with error", e);
        };
        tws.onmessage = function (e) {
            console.log("TWS: " + e.data);
            var resp = JSON.parse(e.data)
            if (resp.success && checkMsg === resp.msg) {
                tws.close();
                main.logPanel.success("Websocket test success...")
            }
        };

    }
})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .controller('MainController', MainController);

    /** @ngInject */
    function MainController($timeout, webDevTec, toastr, ChatService, $scope, VoiceRecognitionService) {
        var main = this;

        //because the UI is being shared between 2 controllers,
        //lets differentiate the by passing a variable into the template
        main.versionName = "Demo 1";

        ChatService.bindConversation(main, 'conversation');

        var reset = function () {
            main.state = "IDLE"; //["RECORDING", "PROCESSING"]
        }
        reset();

        //initialize

        if (!('webkitSpeechRecognition' in window)) {
            //Speech API not supported here…
            alert("Sorry, your browser is not supported. Please use Google Chrome Version 25 and up for this demo.")
        } else {
            var recognition = new webkitSpeechRecognition(); //That is the object that will manage our whole recognition process. 
            recognition.continuous = true; //Suitable for dictation. 
            recognition.interimResults = true; //If we want to start receiving results even if they are not final.
            //Define some more additional parameters for the recognition:
            recognition.lang = "en-US";
            recognition.maxAlternatives = 1; //Since from our experience, the highest result is really the best...

            //setup listeners
            recognition.onstart = function () {
                console.log('recog started');
                main.state = "RECORDING";
            };

            recognition.onresult = function (event) { //the event holds the results
                //Yay – we have results! Let’s check if they are defined and if final or not:
                if (typeof (event.results) === 'undefined') { //Something is wrong…
                    recognition.stop();
                    main.state = "IDLE";
                    return;
                }

                for (var i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) { //Final results

                        recognition.stop();
                        main.state = "PROCESSING";

                        console.log("final results: " + event.results[i][0].transcript); //Of course – here is the place to do useful things with the results.

                        var input = VoiceRecognitionService.processDictatedText(event.results[i][0].transcript);

                        ChatService.processUserMessage(input)
                            .then(function (replyMsg) {

                                responsiveVoice.speak(replyMsg.text, "UK English Female", {
                                    onstart: function () {
                                        console.log("TTS started");
                                    },
                                    onend: function () {
                                        console.log("TTS ended. restarting voice recognition.");
                                        main.start();
                                        $scope.$apply();
                                    }
                                });
                            })
                            .catch(function (errr) {
                                console.log('error');
                                console.log(errr);
                                main.stop();
                                main.isErrored = true;
                            });

                    } else { //i.e. interim...
                        console.log("interim results: " + event.results[i][0].transcript); //You can use these results to give the user near real time experience.
                    }
                }
            };

        }

        main.stop = function () {
            main.state = "IDLE";
            recognition.stop();

            ChatService.clearConversationLog();
            ChatService.bindConversation(main, 'conversation');
        }

        main.initialStart = function () {
            console.log('initializing...');
            main.state = "STARTING";

            ChatService.processUserMessage("start", null, null, null, true)
                .then(function (replyMsg) {

                    // recognition.start();   
                    responsiveVoice.speak(replyMsg.text, "UK English Female", {
                        onstart: function () {
                            main.state = "RECORDING";
                            console.log("TTS started");
                            $scope.$apply();
                        },
                        onend: function () {
                            console.log("TTS ended. restarting voice recognition.");
                            main.start();
                            $scope.$apply();
                        }
                    });
                })
                .catch(function (err) {
                    main.state = "IDLE";
                    main.stop();
                    main.isErrored = true;
                })

        }

        main.start = function () {
            console.log('did click start');
            recognition.start();
            main.state = "RECORDING";
        }

    }
})();

/*
 ResponsiveVoice JS v1.5.1

 (c) 2015-2017 LearnBrite

 License: http://responsivevoice.org/license
*/
if ("undefined" != typeof responsiveVoice) console.log("ResponsiveVoice already loaded"), console.log(responsiveVoice);
else var ResponsiveVoice = function () {
        var a = this;
        a.version = "1.5.1";
        console.log("ResponsiveVoice r" + a.version);
        a.responsivevoices = [{
                name: "UK English Female",
                flag: "gb",
                gender: "f",
                voiceIDs: [3, 5, 1, 6, 7, 171, 278, 201, 257, 258, 8]
            }, {
                name: "UK English Male",
                flag: "gb",
                gender: "m",
                voiceIDs: [0, 4, 2, 75, 277, 202, 256, 159, 6, 7]
            }, {
                name: "US English Female",
                flag: "us",
                gender: "f",
                voiceIDs: [39, 40, 41, 42, 43, 173, 205, 204,
235, 44]
            }, {
                name: "Arabic Male",
                flag: "ar",
                gender: "m",
                voiceIDs: [96, 95, 97, 196, 98],
                deprecated: !0
            }, {
                name: "Arabic Female",
                flag: "ar",
                gender: "f",
                voiceIDs: [96, 95, 97, 196, 98]
            }, {
                name: "Armenian Male",
                flag: "hy",
                gender: "f",
                voiceIDs: [99]
            }, {
                name: "Australian Female",
                flag: "au",
                gender: "f",
                voiceIDs: [87, 86, 5, 276, 201, 88]
            }, {
                name: "Brazilian Portuguese Female",
                flag: "br",
                gender: "f",
                voiceIDs: [245, 124, 123, 125, 186, 223, 126]
            }, {
                name: "Chinese Female",
                flag: "cn",
                gender: "f",
                voiceIDs: [249, 58, 59, 60, 155, 191, 281, 231, 268, 269, 61]
            }, {
                name: "Chinese (Hong Kong) Female",
                flag: "hk",
                gender: "f",
                voiceIDs: [192, 193, 232, 250, 251, 270, 252]
            }, {
                name: "Chinese Taiwan Female",
                flag: "tw",
                gender: "f",
                voiceIDs: [252, 194, 233, 253, 254, 255]
            }, {
                name: "Czech Female",
                flag: "cz",
                gender: "f",
                voiceIDs: [101, 100, 102, 197, 103]
            }, {
                name: "Danish Female",
                flag: "dk",
                gender: "f",
                voiceIDs: [105, 104, 106, 198, 107]
            }, {
                name: "Deutsch Female",
                flag: "de",
                gender: "f",
                voiceIDs: [27, 28, 29, 30, 31, 78, 170, 275, 199, 261, 262, 32]
            }, {
                name: "Dutch Female",
                flag: "nl",
                gender: "f",
                voiceIDs: [243, 219, 84, 157, 158, 184, 45]
            }, {
                name: "Finnish Female",
                flag: "fi",
                gender: "f",
                voiceIDs: [90, 89, 91, 209, 92]
            }, {
                name: "French Female",
                flag: "fr",
                gender: "f",
                voiceIDs: [240, 21, 22, 23, 77, 178, 279, 210, 266, 26]
            }, {
                name: "Greek Female",
                flag: "gr",
                gender: "f",
                voiceIDs: [62, 63, 80, 200, 64]
            }, {
                name: "Hindi Female",
                flag: "hi",
                gender: "f",
                voiceIDs: [247, 66, 154, 179, 213, 259, 67]
            }, {
                name: "Hungarian Female",
                flag: "hu",
                gender: "f",
                voiceIDs: [9, 10, 81, 214, 11]
            }, {
                name: "Indonesian Female",
                flag: "id",
                gender: "f",
                voiceIDs: [241, 111, 112, 180, 215, 113]
            }, {
                name: "Italian Female",
                flag: "it",
                gender: "f",
                voiceIDs: [242, 33, 34, 35,
36, 37, 79, 181, 216, 271, 38]
            }, {
                name: "Japanese Female",
                flag: "jp",
                gender: "f",
                voiceIDs: [248, 50, 51, 52, 153, 182, 280, 217, 273, 274, 53]
            }, {
                name: "Korean Female",
                flag: "kr",
                gender: "f",
                voiceIDs: [54, 55, 56, 156, 183, 218, 57]
            }, {
                name: "Latin Female",
                flag: "va",
                gender: "f",
                voiceIDs: [114]
            }, {
                name: "Norwegian Female",
                flag: "no",
                gender: "f",
                voiceIDs: [72, 73, 221, 74]
            }, {
                name: "Polish Female",
                flag: "pl",
                gender: "f",
                voiceIDs: [244, 120, 119, 121, 185, 222, 267, 122]
            }, {
                name: "Portuguese Female",
                flag: "br",
                gender: "f",
                voiceIDs: [128, 127, 129, 187, 224, 272, 130]
            },
            {
                name: "Romanian Male",
                flag: "ro",
                gender: "m",
                voiceIDs: [151, 150, 152, 225, 46]
            }, {
                name: "Russian Female",
                flag: "ru",
                gender: "f",
                voiceIDs: [246, 47, 48, 83, 188, 226, 260, 49]
            }, {
                name: "Slovak Female",
                flag: "sk",
                gender: "f",
                voiceIDs: [133, 132, 134, 227, 135]
            }, {
                name: "Spanish Female",
                flag: "es",
                gender: "f",
                voiceIDs: [19, 238, 16, 17, 18, 20, 76, 174, 207, 263, 264, 15]
            }, {
                name: "Spanish Latin American Female",
                flag: "es",
                gender: "f",
                voiceIDs: [239, 137, 136, 138, 175, 208, 265, 139]
            }, {
                name: "Swedish Female",
                flag: "sv",
                gender: "f",
                voiceIDs: [85, 148, 149, 228,
65]
            }, {
                name: "Tamil Male",
                flag: "hi",
                gender: "m",
                voiceIDs: [141]
            }, {
                name: "Thai Female",
                flag: "th",
                gender: "f",
                voiceIDs: [143, 142, 144, 189, 229, 145]
            }, {
                name: "Turkish Female",
                flag: "tr",
                gender: "f",
                voiceIDs: [69, 70, 82, 190, 230, 71]
            }, {
                name: "Afrikaans Male",
                flag: "af",
                gender: "m",
                voiceIDs: [93]
            }, {
                name: "Albanian Male",
                flag: "sq",
                gender: "m",
                voiceIDs: [94]
            }, {
                name: "Bosnian Male",
                flag: "bs",
                gender: "m",
                voiceIDs: [14]
            }, {
                name: "Catalan Male",
                flag: "catalonia",
                gender: "m",
                voiceIDs: [68]
            }, {
                name: "Croatian Male",
                flag: "hr",
                gender: "m",
                voiceIDs: [13]
            },
            {
                name: "Czech Male",
                flag: "cz",
                gender: "m",
                voiceIDs: [161]
            }, {
                name: "Danish Male",
                flag: "da",
                gender: "m",
                voiceIDs: [162],
                deprecated: !0
            }, {
                name: "Esperanto Male",
                flag: "eo",
                gender: "m",
                voiceIDs: [108]
            }, {
                name: "Finnish Male",
                flag: "fi",
                gender: "m",
                voiceIDs: [160],
                deprecated: !0
            }, {
                name: "Greek Male",
                flag: "gr",
                gender: "m",
                voiceIDs: [163],
                deprecated: !0
            }, {
                name: "Hungarian Male",
                flag: "hu",
                gender: "m",
                voiceIDs: [164]
            }, {
                name: "Icelandic Male",
                flag: "is",
                gender: "m",
                voiceIDs: [110]
            }, {
                name: "Latin Male",
                flag: "va",
                gender: "m",
                voiceIDs: [165],
                deprecated: !0
            }, {
                name: "Latvian Male",
                flag: "lv",
                gender: "m",
                voiceIDs: [115]
            }, {
                name: "Macedonian Male",
                flag: "mk",
                gender: "m",
                voiceIDs: [116]
            }, {
                name: "Moldavian Male",
                flag: "md",
                gender: "m",
                voiceIDs: [117]
            }, {
                name: "Montenegrin Male",
                flag: "me",
                gender: "m",
                voiceIDs: [118]
            }, {
                name: "Norwegian Male",
                flag: "no",
                gender: "m",
                voiceIDs: [166]
            }, {
                name: "Serbian Male",
                flag: "sr",
                gender: "m",
                voiceIDs: [12]
            }, {
                name: "Serbo-Croatian Male",
                flag: "hr",
                gender: "m",
                voiceIDs: [131]
            }, {
                name: "Slovak Male",
                flag: "sk",
                gender: "m",
                voiceIDs: [167],
                deprecated: !0
            },
            {
                name: "Swahili Male",
                flag: "sw",
                gender: "m",
                voiceIDs: [140]
            }, {
                name: "Swedish Male",
                flag: "sv",
                gender: "m",
                voiceIDs: [168],
                deprecated: !0
            }, {
                name: "Vietnamese Male",
                flag: "vi",
                gender: "m",
                voiceIDs: [146],
                deprecated: !0
            }, {
                name: "Welsh Male",
                flag: "cy",
                gender: "m",
                voiceIDs: [147]
            }, {
                name: "US English Male",
                flag: "us",
                gender: "m",
                voiceIDs: [0, 4, 2, 6, 7, 75, 159, 234, 236, 237]
            }, {
                name: "Fallback UK Female",
                flag: "gb",
                gender: "f",
                voiceIDs: [8]
            }];
        a.voicecollection = [{
                name: "Google UK English Male"
            }, {
                name: "Agnes"
            }, {
                name: "Daniel Compact"
            }, {
                name: "Google UK English Female"
            },
            {
                name: "en-GB",
                rate: .25,
                pitch: 1
            }, {
                name: "en-AU",
                rate: .25,
                pitch: 1
            }, {
                name: "ingl\u00e9s Reino Unido"
            }, {
                name: "English United Kingdom"
            }, {
                name: "Fallback en-GB Female",
                lang: "en-GB",
                fallbackvoice: !0
            }, {
                name: "Eszter Compact"
            }, {
                name: "hu-HU",
                rate: .4
            }, {
                name: "Fallback Hungarian",
                lang: "hu",
                fallbackvoice: !0,
                service: "g2"
            }, {
                name: "Fallback Serbian",
                lang: "sr",
                fallbackvoice: !0
            }, {
                name: "Fallback Croatian",
                lang: "hr",
                fallbackvoice: !0
            }, {
                name: "Fallback Bosnian",
                lang: "bs",
                fallbackvoice: !0
            }, {
                name: "Fallback Spanish",
                lang: "es",
                fallbackvoice: !0
            },
            {
                name: "Spanish Spain"
            }, {
                name: "espa\u00f1ol Espa\u00f1a"
            }, {
                name: "Diego Compact",
                rate: .3
            }, {
                name: "Google Espa\u00f1ol"
            }, {
                name: "es-ES",
                rate: .2
            }, {
                name: "Google Fran\u00e7ais"
            }, {
                name: "French France"
            }, {
                name: "franc\u00e9s Francia"
            }, {
                name: "Virginie Compact",
                rate: .5
            }, {
                name: "fr-FR",
                rate: .25
            }, {
                name: "Fallback French",
                lang: "fr",
                fallbackvoice: !0
            }, {
                name: "Google Deutsch"
            }, {
                name: "German Germany"
            }, {
                name: "alem\u00e1n Alemania"
            }, {
                name: "Yannick Compact",
                rate: .5
            }, {
                name: "de-DE",
                rate: .25
            }, {
                name: "Fallback Deutsch",
                lang: "de",
                fallbackvoice: !0
            }, {
                name: "Google Italiano"
            }, {
                name: "Italian Italy"
            }, {
                name: "italiano Italia"
            }, {
                name: "Paolo Compact",
                rate: .5
            }, {
                name: "it-IT",
                rate: .25
            }, {
                name: "Fallback Italian",
                lang: "it",
                fallbackvoice: !0
            }, {
                name: "Google US English",
                timerSpeed: 1
            }, {
                name: "English United States"
            }, {
                name: "ingl\u00e9s Estados Unidos"
            }, {
                name: "Vicki"
            }, {
                name: "en-US",
                rate: .2,
                pitch: 1,
                timerSpeed: 1.3
            }, {
                name: "Fallback English",
                lang: "en-US",
                fallbackvoice: !0,
                timerSpeed: 0
            }, {
                name: "Fallback Dutch",
                lang: "nl",
                fallbackvoice: !0,
                timerSpeed: 0
            }, {
                name: "Fallback Romanian",
                lang: "ro",
                fallbackvoice: !0
            }, {
                name: "Milena Compact"
            }, {
                name: "ru-RU",
                rate: .25
            }, {
                name: "Fallback Russian",
                lang: "ru",
                fallbackvoice: !0
            }, {
                name: "Google \u65e5\u672c\u4eba",
                timerSpeed: 1
            }, {
                name: "Kyoko Compact"
            }, {
                name: "ja-JP",
                rate: .25
            }, {
                name: "Fallback Japanese",
                lang: "ja",
                fallbackvoice: !0
            }, {
                name: "Google \ud55c\uad6d\uc758",
                timerSpeed: 1
            }, {
                name: "Narae Compact"
            }, {
                name: "ko-KR",
                rate: .25
            }, {
                name: "Fallback Korean",
                lang: "ko",
                fallbackvoice: !0
            }, {
                name: "Google \u4e2d\u56fd\u7684",
                timerSpeed: 1
            }, {
                name: "Ting-Ting Compact"
            }, {
                name: "zh-CN",
                rate: .25
            }, {
                name: "Fallback Chinese",
                lang: "zh-CN",
                fallbackvoice: !0
            }, {
                name: "Alexandros Compact"
            }, {
                name: "el-GR",
                rate: .25
            }, {
                name: "Fallback Greek",
                lang: "el",
                fallbackvoice: !0,
                service: "g2"
            }, {
                name: "Fallback Swedish",
                lang: "sv",
                fallbackvoice: !0,
                service: "g2"
            }, {
                name: "hi-IN",
                rate: .25
            }, {
                name: "Fallback Hindi",
                lang: "hi",
                fallbackvoice: !0
            }, {
                name: "Fallback Catalan",
                lang: "ca",
                fallbackvoice: !0
            }, {
                name: "Aylin Compact"
            }, {
                name: "tr-TR",
                rate: .25
            }, {
                name: "Fallback Turkish",
                lang: "tr",
                fallbackvoice: !0
            }, {
                name: "Stine Compact"
            }, {
                name: "no-NO",
                rate: .25
            }, {
                name: "Fallback Norwegian",
                lang: "no",
                fallbackvoice: !0,
                service: "g2"
            }, {
                name: "Daniel"
            }, {
                name: "Monica"
            }, {
                name: "Amelie"
            }, {
                name: "Anna"
            }, {
                name: "Alice"
            }, {
                name: "Melina"
            }, {
                name: "Mariska"
            }, {
                name: "Yelda"
            }, {
                name: "Milena"
            }, {
                name: "Xander"
            }, {
                name: "Alva"
            }, {
                name: "Lee Compact"
            }, {
                name: "Karen"
            }, {
                name: "Fallback Australian",
                lang: "en-AU",
                fallbackvoice: !0
            }, {
                name: "Mikko Compact"
            }, {
                name: "Satu"
            }, {
                name: "fi-FI",
                rate: .25
            }, {
                name: "Fallback Finnish",
                lang: "fi",
                fallbackvoice: !0,
                service: "g2"
            }, {
                name: "Fallback Afrikans",
                lang: "af",
                fallbackvoice: !0
            }, {
                name: "Fallback Albanian",
                lang: "sq",
                fallbackvoice: !0
            }, {
                name: "Maged Compact"
            }, {
                name: "Tarik"
            }, {
                name: "ar-SA",
                rate: .25
            }, {
                name: "Fallback Arabic",
                lang: "ar",
                fallbackvoice: !0,
                service: "g2"
            }, {
                name: "Fallback Armenian",
                lang: "hy",
                fallbackvoice: !0,
                service: "g2"
            }, {
                name: "Zuzana Compact"
            }, {
                name: "Zuzana"
            }, {
                name: "cs-CZ",
                rate: .25
            }, {
                name: "Fallback Czech",
                lang: "cs",
                fallbackvoice: !0,
                service: "g2"
            }, {
                name: "Ida Compact"
            }, {
                name: "Sara"
            }, {
                name: "da-DK",
                rate: .25
            }, {
                name: "Fallback Danish",
                lang: "da",
                fallbackvoice: !0,
                service: "g2"
            }, {
                name: "Fallback Esperanto",
                lang: "eo",
                fallbackvoice: !0
            }, {
                name: "Fallback Haitian Creole",
                lang: "ht",
                fallbackvoice: !0
            }, {
                name: "Fallback Icelandic",
                lang: "is",
                fallbackvoice: !0
            }, {
                name: "Damayanti"
            }, {
                name: "id-ID",
                rate: .25
            }, {
                name: "Fallback Indonesian",
                lang: "id",
                fallbackvoice: !0
            }, {
                name: "Fallback Latin",
                lang: "la",
                fallbackvoice: !0,
                service: "g2"
            }, {
                name: "Fallback Latvian",
                lang: "lv",
                fallbackvoice: !0
            }, {
                name: "Fallback Macedonian",
                lang: "mk",
                fallbackvoice: !0
            }, {
                name: "Fallback Moldavian",
                lang: "mo",
                fallbackvoice: !0,
                service: "g2"
            }, {
                name: "Fallback Montenegrin",
                lang: "sr-ME",
                fallbackvoice: !0
            }, {
                name: "Agata Compact"
            }, {
                name: "Zosia"
            }, {
                name: "pl-PL",
                rate: .25
            }, {
                name: "Fallback Polish",
                lang: "pl",
                fallbackvoice: !0
            }, {
                name: "Raquel Compact"
            }, {
                name: "Luciana"
            }, {
                name: "pt-BR",
                rate: .25
            }, {
                name: "Fallback Brazilian Portugese",
                lang: "pt-BR",
                fallbackvoice: !0,
                service: "g2"
            }, {
                name: "Joana Compact"
            }, {
                name: "Joana"
            }, {
                name: "pt-PT",
                rate: .25
            }, {
                name: "Fallback Portuguese",
                lang: "pt-PT",
                fallbackvoice: !0
            }, {
                name: "Fallback Serbo-Croation",
                lang: "sh",
                fallbackvoice: !0,
                service: "g2"
            }, {
                name: "Laura Compact"
            }, {
                name: "Laura"
            }, {
                name: "sk-SK",
                rate: .25
            }, {
                name: "Fallback Slovak",
                lang: "sk",
                fallbackvoice: !0,
                service: "g2"
            }, {
                name: "Javier Compact"
            }, {
                name: "Paulina"
            }, {
                name: "es-MX",
                rate: .25
            }, {
                name: "Fallback Spanish (Latin American)",
                lang: "es-419",
                fallbackvoice: !0,
                service: "g2"
            }, {
                name: "Fallback Swahili",
                lang: "sw",
                fallbackvoice: !0
            }, {
                name: "Fallback Tamil",
                lang: "ta",
                fallbackvoice: !0
            }, {
                name: "Narisa Compact"
            }, {
                name: "Kanya"
            }, {
                name: "th-TH",
                rate: .25
            }, {
                name: "Fallback Thai",
                lang: "th",
                fallbackvoice: !0
            },
            {
                name: "Fallback Vietnamese",
                lang: "vi",
                fallbackvoice: !0
            }, {
                name: "Fallback Welsh",
                lang: "cy",
                fallbackvoice: !0
            }, {
                name: "Oskar Compact"
            }, {
                name: "sv-SE",
                rate: .25
            }, {
                name: "Simona Compact"
            }, {
                name: "Ioana"
            }, {
                name: "ro-RO",
                rate: .25
            }, {
                name: "Kyoko"
            }, {
                name: "Lekha"
            }, {
                name: "Ting-Ting"
            }, {
                name: "Yuna"
            }, {
                name: "Xander Compact"
            }, {
                name: "nl-NL",
                rate: .25
            }, {
                name: "Fallback UK English Male",
                lang: "en-GB",
                fallbackvoice: !0,
                service: "g1",
                voicename: "rjs"
            }, {
                name: "Finnish Male",
                lang: "fi",
                fallbackvoice: !0,
                service: "g1",
                voicename: ""
            }, {
                name: "Czech Male",
                lang: "cs",
                fallbackvoice: !0,
                service: "g1",
                voicename: ""
            }, {
                name: "Danish Male",
                lang: "da",
                fallbackvoice: !0,
                service: "g1",
                voicename: ""
            }, {
                name: "Greek Male",
                lang: "el",
                fallbackvoice: !0,
                service: "g1",
                voicename: "",
                rate: .25
            }, {
                name: "Hungarian Male",
                lang: "hu",
                fallbackvoice: !0,
                service: "g1",
                voicename: ""
            }, {
                name: "Latin Male",
                lang: "la",
                fallbackvoice: !0,
                service: "g1",
                voicename: ""
            }, {
                name: "Norwegian Male",
                lang: "no",
                fallbackvoice: !0,
                service: "g1",
                voicename: ""
            }, {
                name: "Slovak Male",
                lang: "sk",
                fallbackvoice: !0,
                service: "g1",
                voicename: ""
            },
            {
                name: "Swedish Male",
                lang: "sv",
                fallbackvoice: !0,
                service: "g1",
                voicename: ""
            }, {
                name: "Fallback US English Male",
                lang: "en",
                fallbackvoice: !0,
                service: "tts-api",
                voicename: ""
            }, {
                name: "German Germany",
                lang: "de_DE"
            }, {
                name: "English United Kingdom",
                lang: "en_GB"
            }, {
                name: "English India",
                lang: "en_IN"
            }, {
                name: "English United States",
                lang: "en_US"
            }, {
                name: "Spanish Spain",
                lang: "es_ES"
            }, {
                name: "Spanish Mexico",
                lang: "es_MX"
            }, {
                name: "Spanish United States",
                lang: "es_US"
            }, {
                name: "French Belgium",
                lang: "fr_BE"
            }, {
                name: "French France",
                lang: "fr_FR"
            }, {
                name: "Hindi India",
                lang: "hi_IN"
            }, {
                name: "Indonesian Indonesia",
                lang: "in_ID"
            }, {
                name: "Italian Italy",
                lang: "it_IT"
            }, {
                name: "Japanese Japan",
                lang: "ja_JP"
            }, {
                name: "Korean South Korea",
                lang: "ko_KR"
            }, {
                name: "Dutch Netherlands",
                lang: "nl_NL"
            }, {
                name: "Polish Poland",
                lang: "pl_PL"
            }, {
                name: "Portuguese Brazil",
                lang: "pt_BR"
            }, {
                name: "Portuguese Portugal",
                lang: "pt_PT"
            }, {
                name: "Russian Russia",
                lang: "ru_RU"
            }, {
                name: "Thai Thailand",
                lang: "th_TH"
            }, {
                name: "Turkish Turkey",
                lang: "tr_TR"
            }, {
                name: "Chinese China",
                lang: "zh_CN_#Hans"
            },
            {
                name: "Chinese Hong Kong",
                lang: "zh_HK_#Hans"
            }, {
                name: "Chinese Hong Kong",
                lang: "zh_HK_#Hant"
            }, {
                name: "Chinese Taiwan",
                lang: "zh_TW_#Hant"
            }, {
                name: "Alex"
            }, {
                name: "Maged",
                lang: "ar-SA"
            }, {
                name: "Zuzana",
                lang: "cs-CZ"
            }, {
                name: "Sara",
                lang: "da-DK"
            }, {
                name: "Anna",
                lang: "de-DE"
            }, {
                name: "Melina",
                lang: "el-GR"
            }, {
                name: "Karen",
                lang: "en-AU"
            }, {
                name: "Daniel",
                lang: "en-GB"
            }, {
                name: "Moira",
                lang: "en-IE"
            }, {
                name: "Samantha (Enhanced)",
                lang: "en-US"
            }, {
                name: "Samantha",
                lang: "en-US"
            }, {
                name: "Tessa",
                lang: "en-ZA"
            }, {
                name: "Monica",
                lang: "es-ES"
            },
            {
                name: "Paulina",
                lang: "es-MX"
            }, {
                name: "Satu",
                lang: "fi-FI"
            }, {
                name: "Amelie",
                lang: "fr-CA"
            }, {
                name: "Thomas",
                lang: "fr-FR"
            }, {
                name: "Carmit",
                lang: "he-IL"
            }, {
                name: "Lekha",
                lang: "hi-IN"
            }, {
                name: "Mariska",
                lang: "hu-HU"
            }, {
                name: "Damayanti",
                lang: "id-ID"
            }, {
                name: "Alice",
                lang: "it-IT"
            }, {
                name: "Kyoko",
                lang: "ja-JP"
            }, {
                name: "Yuna",
                lang: "ko-KR"
            }, {
                name: "Ellen",
                lang: "nl-BE"
            }, {
                name: "Xander",
                lang: "nl-NL"
            }, {
                name: "Nora",
                lang: "no-NO"
            }, {
                name: "Zosia",
                lang: "pl-PL"
            }, {
                name: "Luciana",
                lang: "pt-BR"
            }, {
                name: "Joana",
                lang: "pt-PT"
            }, {
                name: "Ioana",
                lang: "ro-RO"
            }, {
                name: "Milena",
                lang: "ru-RU"
            }, {
                name: "Laura",
                lang: "sk-SK"
            }, {
                name: "Alva",
                lang: "sv-SE"
            }, {
                name: "Kanya",
                lang: "th-TH"
            }, {
                name: "Yelda",
                lang: "tr-TR"
            }, {
                name: "Ting-Ting",
                lang: "zh-CN"
            }, {
                name: "Sin-Ji",
                lang: "zh-HK"
            }, {
                name: "Mei-Jia",
                lang: "zh-TW"
            }, {
                name: "Microsoft David Mobile - English (United States)",
                lang: "en-US"
            }, {
                name: "Microsoft Zira Mobile - English (United States)",
                lang: "en-US"
            }, {
                name: "Microsoft Mark Mobile - English (United States)",
                lang: "en-US"
            }, {
                name: "native",
                lang: ""
            }, {
                name: "Google espa\u00f1ol"
            },
            {
                name: "Google espa\u00f1ol de Estados Unidos"
            }, {
                name: "Google fran\u00e7ais"
            }, {
                name: "Google Bahasa Indonesia"
            }, {
                name: "Google italiano"
            }, {
                name: "Google Nederlands"
            }, {
                name: "Google polski"
            }, {
                name: "Google portugu\u00eas do Brasil"
            }, {
                name: "Google \u0440\u0443\u0441\u0441\u043a\u0438\u0439"
            }, {
                name: "Google \u0939\u093f\u0928\u094d\u0926\u0940"
            }, {
                name: "Google \u65e5\u672c\u8a9e"
            }, {
                name: "Google \u666e\u901a\u8bdd\uff08\u4e2d\u56fd\u5927\u9646\uff09"
            }, {
                name: "Google \u7ca4\u8a9e\uff08\u9999\u6e2f\uff09"
            }, {
                name: "zh-HK",
                rate: .25
            }, {
                name: "Fallback Chinese (Hong Kong) Female",
                lang: "zh-HK",
                fallbackvoice: !0,
                service: "g1"
            }, {
                name: "Google \u7ca4\u8a9e\uff08\u9999\u6e2f\uff09"
            }, {
                name: "zh-TW",
                rate: .25
            }, {
                name: "Fallback Chinese (Taiwan) Female",
                lang: "zh-TW",
                fallbackvoice: !0,
                service: "g1"
            }, {
                name: "Microsoft George Mobile - English (United Kingdom)",
                lang: "en-GB"
            }, {
                name: "Microsoft Susan Mobile - English (United Kingdom)",
                lang: "en-GB"
            }, {
                name: "Microsoft Hazel Mobile - English (United Kingdom)",
                lang: "en-GB"
            }, {
                name: "Microsoft Heera Mobile - English (India)",
                lang: "en-In"
            }, {
                name: "Microsoft Irina Mobile - Russian (Russia)",
                lang: "ru-RU"
            }, {
                name: "Microsoft Hedda Mobile - German (Germany)",
                lang: "de-DE"
            }, {
                name: "Microsoft Katja Mobile - German (Germany)",
                lang: "de-DE"
            }, {
                name: "Microsoft Helena Mobile - Spanish (Spain)",
                lang: "es-ES"
            }, {
                name: "Microsoft Laura Mobile - Spanish (Spain)",
                lang: "es-ES"
            }, {
                name: "Microsoft Sabina Mobile - Spanish (Mexico)",
                lang: "es-MX"
            }, {
                name: "Microsoft Julie Mobile - French (France)",
                lang: "fr-FR"
            }, {
                name: "Microsoft Paulina Mobile - Polish (Poland)",
                lang: "pl-PL"
            }, {
                name: "Microsoft Huihui Mobile - Chinese (Simplified, PRC)",
                lang: "zh-CN"
            }, {
                name: "Microsoft Yaoyao Mobile - Chinese (Simplified, PRC)",
                lang: "zh-CN"
            }, {
                name: "Microsoft Tracy Mobile - Chinese (Traditional, Hong Kong S.A.R.)",
                lang: "zh-CN"
            }, {
                name: "Microsoft Elsa Mobile - Italian (Italy)",
                lang: "it-IT"
            }, {
                name: "Microsoft Maria Mobile - Portuguese (Brazil)",
                lang: "pt-BR"
            }, {
                name: "Microsoft Ayumi Mobile - Japanese (Japan)",
                lang: "ja-JP"
            }, {
                name: "Microsoft Haruka Mobile - Japanese (Japan)",
                lang: "ja-JP"
            },
            {
                name: "Helena",
                lang: "de-DE"
            }, {
                name: "Catherine",
                lang: "en-AU"
            }, {
                name: "Arthur",
                lang: "en-GB"
            }, {
                name: "Martha",
                lang: "en-GB"
            }, {
                name: "Marie",
                lang: "fr-FR"
            }, {
                name: "O-ren",
                lang: "ja-JP"
            }, {
                name: "Yu-shu",
                lang: "zh-CN"
            }];
        a.iOS = /(iPad|iPhone|iPod)/g.test(navigator.userAgent);
        a.iOS9 = /(iphone|ipod|ipad).* os 9_/.test(navigator.userAgent.toLowerCase());
        a.iOS10 = /(iphone|ipod|ipad).* os 10_/.test(navigator.userAgent.toLowerCase());
        a.iOS9plus = /(iphone|ipod|ipad).* os 10_/.test(navigator.userAgent.toLowerCase()) || /(iphone|ipod|ipad).* os 10_/.test(navigator.userAgent.toLowerCase());
        a.is_chrome = -1 < navigator.userAgent.indexOf("Chrome");
        a.is_safari = -1 < navigator.userAgent.indexOf("Safari");
        a.is_chrome && a.is_safari && (a.is_safari = !1);
        a.is_opera = !!window.opera || 0 <= navigator.userAgent.indexOf(" OPR/");
        a.is_android = -1 < navigator.userAgent.toLowerCase().indexOf("android");
        a.iOS_initialized = !1;
        a.iOS9_initialized = !1;
        a.iOS10_initialized = !1;
        a.cache_ios_voices = [{
                name: "he-IL",
                voiceURI: "he-IL",
                lang: "he-IL"
            }, {
                name: "th-TH",
                voiceURI: "th-TH",
                lang: "th-TH"
            }, {
                name: "pt-BR",
                voiceURI: "pt-BR",
                lang: "pt-BR"
            },
            {
                name: "sk-SK",
                voiceURI: "sk-SK",
                lang: "sk-SK"
            }, {
                name: "fr-CA",
                voiceURI: "fr-CA",
                lang: "fr-CA"
            }, {
                name: "ro-RO",
                voiceURI: "ro-RO",
                lang: "ro-RO"
            }, {
                name: "no-NO",
                voiceURI: "no-NO",
                lang: "no-NO"
            }, {
                name: "fi-FI",
                voiceURI: "fi-FI",
                lang: "fi-FI"
            }, {
                name: "pl-PL",
                voiceURI: "pl-PL",
                lang: "pl-PL"
            }, {
                name: "de-DE",
                voiceURI: "de-DE",
                lang: "de-DE"
            }, {
                name: "nl-NL",
                voiceURI: "nl-NL",
                lang: "nl-NL"
            }, {
                name: "id-ID",
                voiceURI: "id-ID",
                lang: "id-ID"
            }, {
                name: "tr-TR",
                voiceURI: "tr-TR",
                lang: "tr-TR"
            }, {
                name: "it-IT",
                voiceURI: "it-IT",
                lang: "it-IT"
            }, {
                name: "pt-PT",
                voiceURI: "pt-PT",
                lang: "pt-PT"
            }, {
                name: "fr-FR",
                voiceURI: "fr-FR",
                lang: "fr-FR"
            }, {
                name: "ru-RU",
                voiceURI: "ru-RU",
                lang: "ru-RU"
            }, {
                name: "es-MX",
                voiceURI: "es-MX",
                lang: "es-MX"
            }, {
                name: "zh-HK",
                voiceURI: "zh-HK",
                lang: "zh-HK"
            }, {
                name: "sv-SE",
                voiceURI: "sv-SE",
                lang: "sv-SE"
            }, {
                name: "hu-HU",
                voiceURI: "hu-HU",
                lang: "hu-HU"
            }, {
                name: "zh-TW",
                voiceURI: "zh-TW",
                lang: "zh-TW"
            }, {
                name: "es-ES",
                voiceURI: "es-ES",
                lang: "es-ES"
            }, {
                name: "zh-CN",
                voiceURI: "zh-CN",
                lang: "zh-CN"
            }, {
                name: "nl-BE",
                voiceURI: "nl-BE",
                lang: "nl-BE"
            }, {
                name: "en-GB",
                voiceURI: "en-GB",
                lang: "en-GB"
            }, {
                name: "ar-SA",
                voiceURI: "ar-SA",
                lang: "ar-SA"
            }, {
                name: "ko-KR",
                voiceURI: "ko-KR",
                lang: "ko-KR"
            }, {
                name: "cs-CZ",
                voiceURI: "cs-CZ",
                lang: "cs-CZ"
            }, {
                name: "en-ZA",
                voiceURI: "en-ZA",
                lang: "en-ZA"
            }, {
                name: "en-AU",
                voiceURI: "en-AU",
                lang: "en-AU"
            }, {
                name: "da-DK",
                voiceURI: "da-DK",
                lang: "da-DK"
            }, {
                name: "en-US",
                voiceURI: "en-US",
                lang: "en-US"
            }, {
                name: "en-IE",
                voiceURI: "en-IE",
                lang: "en-IE"
            }, {
                name: "hi-IN",
                voiceURI: "hi-IN",
                lang: "hi-IN"
            }, {
                name: "el-GR",
                voiceURI: "el-GR",
                lang: "el-GR"
            }, {
                name: "ja-JP",
                voiceURI: "ja-JP",
                lang: "ja-JP"
            }];
        a.cache_ios9_voices = [{
            name: "Maged",
            voiceURI: "com.apple.ttsbundle.Maged-compact",
            lang: "ar-SA",
            localService: !0,
            "default": !0
        }, {
            name: "Zuzana",
            voiceURI: "com.apple.ttsbundle.Zuzana-compact",
            lang: "cs-CZ",
            localService: !0,
            "default": !0
        }, {
            name: "Sara",
            voiceURI: "com.apple.ttsbundle.Sara-compact",
            lang: "da-DK",
            localService: !0,
            "default": !0
        }, {
            name: "Anna",
            voiceURI: "com.apple.ttsbundle.Anna-compact",
            lang: "de-DE",
            localService: !0,
            "default": !0
        }, {
            name: "Melina",
            voiceURI: "com.apple.ttsbundle.Melina-compact",
            lang: "el-GR",
            localService: !0,
            "default": !0
        }, {
            name: "Karen",
            voiceURI: "com.apple.ttsbundle.Karen-compact",
            lang: "en-AU",
            localService: !0,
            "default": !0
        }, {
            name: "Daniel",
            voiceURI: "com.apple.ttsbundle.Daniel-compact",
            lang: "en-GB",
            localService: !0,
            "default": !0
        }, {
            name: "Moira",
            voiceURI: "com.apple.ttsbundle.Moira-compact",
            lang: "en-IE",
            localService: !0,
            "default": !0
        }, {
            name: "Samantha (Enhanced)",
            voiceURI: "com.apple.ttsbundle.Samantha-premium",
            lang: "en-US",
            localService: !0,
            "default": !0
        }, {
            name: "Samantha",
            voiceURI: "com.apple.ttsbundle.Samantha-compact",
            lang: "en-US",
            localService: !0,
            "default": !0
        }, {
            name: "Tessa",
            voiceURI: "com.apple.ttsbundle.Tessa-compact",
            lang: "en-ZA",
            localService: !0,
            "default": !0
        }, {
            name: "Monica",
            voiceURI: "com.apple.ttsbundle.Monica-compact",
            lang: "es-ES",
            localService: !0,
            "default": !0
        }, {
            name: "Paulina",
            voiceURI: "com.apple.ttsbundle.Paulina-compact",
            lang: "es-MX",
            localService: !0,
            "default": !0
        }, {
            name: "Satu",
            voiceURI: "com.apple.ttsbundle.Satu-compact",
            lang: "fi-FI",
            localService: !0,
            "default": !0
        }, {
            name: "Amelie",
            voiceURI: "com.apple.ttsbundle.Amelie-compact",
            lang: "fr-CA",
            localService: !0,
            "default": !0
        }, {
            name: "Thomas",
            voiceURI: "com.apple.ttsbundle.Thomas-compact",
            lang: "fr-FR",
            localService: !0,
            "default": !0
        }, {
            name: "Carmit",
            voiceURI: "com.apple.ttsbundle.Carmit-compact",
            lang: "he-IL",
            localService: !0,
            "default": !0
        }, {
            name: "Lekha",
            voiceURI: "com.apple.ttsbundle.Lekha-compact",
            lang: "hi-IN",
            localService: !0,
            "default": !0
        }, {
            name: "Mariska",
            voiceURI: "com.apple.ttsbundle.Mariska-compact",
            lang: "hu-HU",
            localService: !0,
            "default": !0
        }, {
            name: "Damayanti",
            voiceURI: "com.apple.ttsbundle.Damayanti-compact",
            lang: "id-ID",
            localService: !0,
            "default": !0
        }, {
            name: "Alice",
            voiceURI: "com.apple.ttsbundle.Alice-compact",
            lang: "it-IT",
            localService: !0,
            "default": !0
        }, {
            name: "Kyoko",
            voiceURI: "com.apple.ttsbundle.Kyoko-compact",
            lang: "ja-JP",
            localService: !0,
            "default": !0
        }, {
            name: "Yuna",
            voiceURI: "com.apple.ttsbundle.Yuna-compact",
            lang: "ko-KR",
            localService: !0,
            "default": !0
        }, {
            name: "Ellen",
            voiceURI: "com.apple.ttsbundle.Ellen-compact",
            lang: "nl-BE",
            localService: !0,
            "default": !0
        }, {
            name: "Xander",
            voiceURI: "com.apple.ttsbundle.Xander-compact",
            lang: "nl-NL",
            localService: !0,
            "default": !0
        }, {
            name: "Nora",
            voiceURI: "com.apple.ttsbundle.Nora-compact",
            lang: "no-NO",
            localService: !0,
            "default": !0
        }, {
            name: "Zosia",
            voiceURI: "com.apple.ttsbundle.Zosia-compact",
            lang: "pl-PL",
            localService: !0,
            "default": !0
        }, {
            name: "Luciana",
            voiceURI: "com.apple.ttsbundle.Luciana-compact",
            lang: "pt-BR",
            localService: !0,
            "default": !0
        }, {
            name: "Joana",
            voiceURI: "com.apple.ttsbundle.Joana-compact",
            lang: "pt-PT",
            localService: !0,
            "default": !0
        }, {
            name: "Ioana",
            voiceURI: "com.apple.ttsbundle.Ioana-compact",
            lang: "ro-RO",
            localService: !0,
            "default": !0
        }, {
            name: "Milena",
            voiceURI: "com.apple.ttsbundle.Milena-compact",
            lang: "ru-RU",
            localService: !0,
            "default": !0
        }, {
            name: "Laura",
            voiceURI: "com.apple.ttsbundle.Laura-compact",
            lang: "sk-SK",
            localService: !0,
            "default": !0
        }, {
            name: "Alva",
            voiceURI: "com.apple.ttsbundle.Alva-compact",
            lang: "sv-SE",
            localService: !0,
            "default": !0
        }, {
            name: "Kanya",
            voiceURI: "com.apple.ttsbundle.Kanya-compact",
            lang: "th-TH",
            localService: !0,
            "default": !0
        }, {
            name: "Yelda",
            voiceURI: "com.apple.ttsbundle.Yelda-compact",
            lang: "tr-TR",
            localService: !0,
            "default": !0
        }, {
            name: "Ting-Ting",
            voiceURI: "com.apple.ttsbundle.Ting-Ting-compact",
            lang: "zh-CN",
            localService: !0,
            "default": !0
        }, {
            name: "Sin-Ji",
            voiceURI: "com.apple.ttsbundle.Sin-Ji-compact",
            lang: "zh-HK",
            localService: !0,
            "default": !0
        }, {
            name: "Mei-Jia",
            voiceURI: "com.apple.ttsbundle.Mei-Jia-compact",
            lang: "zh-TW",
            localService: !0,
            "default": !0
        }];
        a.cache_ios10_voices = [{
                name: "Maged",
                voiceURI: "com.apple.ttsbundle.Maged-compact",
                lang: "ar-SA"
            }, {
                name: "Zuzana",
                voiceURI: "com.apple.ttsbundle.Zuzana-compact",
                lang: "cs-CZ"
            }, {
                name: "Sara",
                voiceURI: "com.apple.ttsbundle.Sara-compact",
                lang: "da-DK"
            }, {
                name: "Anna",
                voiceURI: "com.apple.ttsbundle.Anna-compact",
                lang: "de-DE"
            }, {
                name: "Helena",
                voiceURI: "com.apple.ttsbundle.siri_female_de-DE_compact",
                lang: "de-DE"
            }, {
                name: "Martin",
                voiceURI: "com.apple.ttsbundle.siri_male_de-DE_compact",
                lang: "de-DE"
            }, {
                name: "Nikos (Enhanced)",
                voiceURI: "com.apple.ttsbundle.Nikos-premium",
                lang: "el-GR"
            }, {
                name: "Melina",
                voiceURI: "com.apple.ttsbundle.Melina-compact",
                lang: "el-GR"
            }, {
                name: "Nikos",
                voiceURI: "com.apple.ttsbundle.Nikos-compact",
                lang: "el-GR"
            }, {
                name: "Catherine",
                voiceURI: "com.apple.ttsbundle.siri_female_en-AU_compact",
                lang: "en-AU"
            }, {
                name: "Gordon",
                voiceURI: "com.apple.ttsbundle.siri_male_en-AU_compact",
                lang: "en-AU"
            }, {
                name: "Karen",
                voiceURI: "com.apple.ttsbundle.Karen-compact",
                lang: "en-AU"
            }, {
                name: "Daniel (Enhanced)",
                voiceURI: "com.apple.ttsbundle.Daniel-premium",
                lang: "en-GB"
            }, {
                name: "Arthur",
                voiceURI: "com.apple.ttsbundle.siri_male_en-GB_compact",
                lang: "en-GB"
            }, {
                name: "Daniel",
                voiceURI: "com.apple.ttsbundle.Daniel-compact",
                lang: "en-GB"
            },
            {
                name: "Martha",
                voiceURI: "com.apple.ttsbundle.siri_female_en-GB_compact",
                lang: "en-GB"
            }, {
                name: "Moira",
                voiceURI: "com.apple.ttsbundle.Moira-compact",
                lang: "en-IE"
            }, {
                name: "Nicky (Enhanced)",
                voiceURI: "com.apple.ttsbundle.siri_female_en-US_premium",
                lang: "en-US"
            }, {
                name: "Samantha (Enhanced)",
                voiceURI: "com.apple.ttsbundle.Samantha-premium",
                lang: "en-US"
            }, {
                name: "Aaron",
                voiceURI: "com.apple.ttsbundle.siri_male_en-US_compact",
                lang: "en-US"
            }, {
                name: "Fred",
                voiceURI: "com.apple.speech.synthesis.voice.Fred",
                lang: "en-US"
            },
            {
                name: "Nicky",
                voiceURI: "com.apple.ttsbundle.siri_female_en-US_compact",
                lang: "en-US"
            }, {
                name: "Samantha",
                voiceURI: "com.apple.ttsbundle.Samantha-compact",
                lang: "en-US"
            }, {
                name: "Tessa",
                voiceURI: "com.apple.ttsbundle.Tessa-compact",
                lang: "en-ZA"
            }, {
                name: "Monica",
                voiceURI: "com.apple.ttsbundle.Monica-compact",
                lang: "es-ES"
            }, {
                name: "Paulina",
                voiceURI: "com.apple.ttsbundle.Paulina-compact",
                lang: "es-MX"
            }, {
                name: "Satu",
                voiceURI: "com.apple.ttsbundle.Satu-compact",
                lang: "fi-FI"
            }, {
                name: "Amelie",
                voiceURI: "com.apple.ttsbundle.Amelie-compact",
                lang: "fr-CA"
            }, {
                name: "Daniel",
                voiceURI: "com.apple.ttsbundle.siri_male_fr-FR_compact",
                lang: "fr-FR"
            }, {
                name: "Marie",
                voiceURI: "com.apple.ttsbundle.siri_female_fr-FR_compact",
                lang: "fr-FR"
            }, {
                name: "Thomas",
                voiceURI: "com.apple.ttsbundle.Thomas-compact",
                lang: "fr-FR"
            }, {
                name: "Carmit",
                voiceURI: "com.apple.ttsbundle.Carmit-compact",
                lang: "he-IL"
            }, {
                name: "Lekha",
                voiceURI: "com.apple.ttsbundle.Lekha-compact",
                lang: "hi-IN"
            }, {
                name: "Mariska",
                voiceURI: "com.apple.ttsbundle.Mariska-compact",
                lang: "hu-HU"
            }, {
                name: "Damayanti",
                voiceURI: "com.apple.ttsbundle.Damayanti-compact",
                lang: "id-ID"
            }, {
                name: "Alice",
                voiceURI: "com.apple.ttsbundle.Alice-compact",
                lang: "it-IT"
            }, {
                name: "Hattori",
                voiceURI: "com.apple.ttsbundle.siri_male_ja-JP_compact",
                lang: "ja-JP"
            }, {
                name: "Kyoko",
                voiceURI: "com.apple.ttsbundle.Kyoko-compact",
                lang: "ja-JP"
            }, {
                name: "O-ren",
                voiceURI: "com.apple.ttsbundle.siri_female_ja-JP_compact",
                lang: "ja-JP"
            }, {
                name: "Yuna",
                voiceURI: "com.apple.ttsbundle.Yuna-compact",
                lang: "ko-KR"
            }, {
                name: "Ellen",
                voiceURI: "com.apple.ttsbundle.Ellen-compact",
                lang: "nl-BE"
            }, {
                name: "Xander",
                voiceURI: "com.apple.ttsbundle.Xander-compact",
                lang: "nl-NL"
            }, {
                name: "Nora",
                voiceURI: "com.apple.ttsbundle.Nora-compact",
                lang: "no-NO"
            }, {
                name: "Zosia",
                voiceURI: "com.apple.ttsbundle.Zosia-compact",
                lang: "pl-PL"
            }, {
                name: "Luciana",
                voiceURI: "com.apple.ttsbundle.Luciana-compact",
                lang: "pt-BR"
            }, {
                name: "Joana",
                voiceURI: "com.apple.ttsbundle.Joana-compact",
                lang: "pt-PT"
            }, {
                name: "Ioana",
                voiceURI: "com.apple.ttsbundle.Ioana-compact",
                lang: "ro-RO"
            }, {
                name: "Milena",
                voiceURI: "com.apple.ttsbundle.Milena-compact",
                lang: "ru-RU"
            }, {
                name: "Laura",
                voiceURI: "com.apple.ttsbundle.Laura-compact",
                lang: "sk-SK"
            }, {
                name: "Alva",
                voiceURI: "com.apple.ttsbundle.Alva-compact",
                lang: "sv-SE"
            }, {
                name: "Kanya",
                voiceURI: "com.apple.ttsbundle.Kanya-compact",
                lang: "th-TH"
            }, {
                name: "Yelda",
                voiceURI: "com.apple.ttsbundle.Yelda-compact",
                lang: "tr-TR"
            }, {
                name: "Li-mu",
                voiceURI: "com.apple.ttsbundle.siri_male_zh-CN_compact",
                lang: "zh-CN"
            }, {
                name: "Ting-Ting",
                voiceURI: "com.apple.ttsbundle.Ting-Ting-compact",
                lang: "zh-CN"
            }, {
                name: "Yu-shu",
                voiceURI: "com.apple.ttsbundle.siri_female_zh-CN_compact",
                lang: "zh-CN"
            }, {
                name: "Sin-Ji",
                voiceURI: "com.apple.ttsbundle.Sin-Ji-compact",
                lang: "zh-HK"
            }, {
                name: "Mei-Jia",
                voiceURI: "com.apple.ttsbundle.Mei-Jia-compact",
                lang: "zh-TW"
            }];
        a.systemvoices = null;
        a.CHARACTER_LIMIT = 100;
        a.VOICESUPPORT_ATTEMPTLIMIT = 5;
        a.voicesupport_attempts = 0;
        a.fallbackMode = !1;
        a.WORDS_PER_MINUTE = 130;
        a.fallback_parts = null;
        a.fallback_part_index = 0;
        a.fallback_audio = null;
        a.fallback_playbackrate = 1;
        a.def_fallback_playbackrate = a.fallback_playbackrate;
        a.fallback_audiopool = [];
        a.msgparameters = null;
        a.timeoutId =
            null;
        a.OnLoad_callbacks = [];
        a.useTimer = !1;
        a.utterances = [];
        a.tstCompiled = function (a) {
            return eval("typeof xy === 'undefined'")
        };
        a.fallbackServicePath = "https://code.responsivevoice.org/" + (a.tstCompiled() ? "" : "develop/") + "getvoice.php";
        a.default_rv = a.responsivevoices[0];
        a.debug = !1;
        a.rvsMapped = !1;
        a.log = function (b) {
            a.debug && console.log(b)
        };
        a.init = function () {
            a.is_android && (a.useTimer = !0);
            a.is_opera || "undefined" === typeof speechSynthesis ? (console.log("RV: Voice synthesis not supported"), a.enableFallbackMode()) :
                setTimeout(function () {
                    var b = setInterval(function () {
                        var c = window.speechSynthesis.getVoices();
                        0 != c.length || null != a.systemvoices && 0 != a.systemvoices.length ? (console.log("RV: Voice support ready"), a.systemVoicesReady(c), clearInterval(b)) : (console.log("Voice support NOT ready"), a.voicesupport_attempts++, a.voicesupport_attempts > a.VOICESUPPORT_ATTEMPTLIMIT && (clearInterval(b), null != window.speechSynthesis ? a.iOS ? (a.iOS10 ? a.systemVoicesReady(a.cache_ios10_voices) : a.iOS9 ? a.systemVoicesReady(a.cache_ios9_voices) :
                            a.systemVoicesReady(a.cache_ios_voices), console.log("RV: Voice support ready (cached)")) : (console.log("RV: speechSynthesis present but no system voices found"), a.enableFallbackMode()) : a.enableFallbackMode()))
                    }, 100)
                }, 100);
            a.Dispatch("OnLoad")
        };
        a.systemVoicesReady = function (b) {
            a.systemvoices = b;
            a.mapRVs();
            null != a.OnVoiceReady && a.OnVoiceReady.call();
            a.Dispatch("OnReady");
            window.hasOwnProperty("dispatchEvent") && window.dispatchEvent(new Event("ResponsiveVoice_OnReady"))
        };
        a.enableFallbackMode = function () {
            a.fallbackMode = !0;
            console.log("RV: Enabling fallback mode");
            a.mapRVs();
            null != a.OnVoiceReady && a.OnVoiceReady.call();
            a.Dispatch("OnReady");
            window.hasOwnProperty("dispatchEvent") && window.dispatchEvent(new Event("ResponsiveVoice_OnReady"))
        };
        a.getVoices = function () {
            for (var b = [], c = 0; c < a.responsivevoices.length; c++) b.push({
                name: a.responsivevoices[c].name
            });
            return b
        };
        a.speak = function (b, c, d) {
            if (a.rvsMapped) {
                var h = null;
                if (a.iOS9 && !a.iOS9_initialized) a.log("Initializing ios9"), setTimeout(function () {
                        a.speak(b, c, d)
                    }, 100), a.clickEvent(),
                    a.iOS9_initialized = !0;
                else if (a.iOS10 && !a.iOS10_initialized) a.log("Initializing ios10"), setTimeout(function () {
                    a.speak(b, c, d)
                }, 100), a.clickEvent(), a.iOS10_initialized = !0;
                else {
                    a.isPlaying() && (a.log("Cancelling previous speech"), a.cancel());
                    a.fallbackMode && 0 < a.fallback_audiopool.length && a.clearFallbackPool();
                    b = b.replace(/[\"\`]/gm, "'");
                    a.msgparameters = d || {};
                    a.msgtext = b;
                    a.msgvoicename = c;
                    a.onstartFired = !1;
                    var k = [];
                    if (b.length > a.CHARACTER_LIMIT) {
                        for (var f = b; f.length > a.CHARACTER_LIMIT;) {
                            var g = f.search(/[:!?.;]+/),
                                e = "";
                            if (-1 == g || g >= a.CHARACTER_LIMIT) g = f.search(/[,]+/); - 1 == g && -1 == f.search(" ") && (g = 99);
                            if (-1 == g || g >= a.CHARACTER_LIMIT)
                                for (var l = f.split(" "), g = 0; g < l.length && !(e.length + l[g].length + 1 > a.CHARACTER_LIMIT); g++) e += (0 != g ? " " : "") + l[g];
                            else e = f.substr(0, g + 1);
                            f = f.substr(e.length, f.length - e.length);
                            k.push(e)
                        }
                        0 < f.length && k.push(f)
                    } else k.push(b);
                    a.multipartText = k;
                    null == c ? (a.setDefaultVoice("UK English Female"), g = a.default_rv) : g = a.getResponsiveVoice(c);
                    !0 === g.deprecated && console.warn("ResponsiveVoice: Voice " +
                        g.name + " is deprecated and will be removed in future releases");
                    f = {};
                    if (null != g.mappedProfile) f = g.mappedProfile;
                    else if (f.systemvoice = a.getMatchedVoice(g), f.collectionvoice = {}, null == f.systemvoice) {
                        console.log("RV: ERROR: No voice found for: " + c);
                        return
                    }
                    a.msgprofile = f;
                    a.log("Voice picked: " + a.msgprofile.systemvoice.name);
                    a.utterances = [];
                    for (g = 0; g < k.length; g++)
                        if (!a.fallbackMode && a.getServiceEnabled(a.services.NATIVE_TTS)) a.log("Using SpeechSynthesis"), h = a.services.NATIVE_TTS, e = new SpeechSynthesisUtterance,
                            e.voiceURI = f.systemvoice.voiceURI, e.volume = a.selectBest([f.collectionvoice.volume, f.systemvoice.volume, 1]), e.rate = a.selectBest([a.iOS9plus ? 1 : null, f.collectionvoice.rate, f.systemvoice.rate, 1]), e.pitch = a.selectBest([f.collectionvoice.pitch, f.systemvoice.pitch, 1]), e.text = k[g], e.lang = a.selectBest([f.collectionvoice.lang, f.systemvoice.lang]), e.rvIndex = g, e.rvTotal = k.length, 0 == g && (e.onstart = a.speech_onstart), a.msgparameters.onendcalled = !1, null != d ? (e.voice = "undefined" !== typeof d.voice ? d.voice : f.systemvoice,
                                g < k.length - 1 && 1 < k.length ? (e.onend = a.onPartEnd, e.hasOwnProperty("addEventListener") && e.addEventListener("end", a.onPartEnd)) : (e.onend = a.speech_onend, e.hasOwnProperty("addEventListener") && e.addEventListener("end", a.speech_onend)), e.onerror = d.onerror || function (b) {
                                    a.log("RV: Unknow Error");
                                    a.log(b)
                                }, e.onpause = d.onpause, e.onresume = d.onresume, e.onmark = d.onmark, e.onboundary = d.onboundary || a.onboundary, e.pitch = null != d.pitch ? d.pitch : e.pitch, e.rate = a.iOS ? (null != d.rate ? d.rate * d.rate : 1) * e.rate : (null != d.rate ? d.rate :
                                    1) * e.rate, e.volume = null != d.volume ? d.volume : e.volume) : (a.log("No Params received for current Utterance"), e.voice = f.systemvoice, e.onend = a.speech_onend, e.onboundary = a.onboundary, e.onerror = function (b) {
                                a.log("RV: Unknow Error");
                                a.log(b)
                            }), a.utterances.push(e), 0 == g && (a.currentMsg = e), console.log(e), a.tts_speak(e);
                        else if (a.fallbackMode && a.getServiceEnabled(a.services.FALLBACK_AUDIO)) {
                        h = a.services.FALLBACK_AUDIO;
                        a.fallback_playbackrate = a.def_fallback_playbackrate;
                        var e = a.selectBest([f.collectionvoice.pitch,
f.systemvoice.pitch, 1]),
                            l = a.selectBest([a.iOS9plus ? 1 : null, f.collectionvoice.rate, f.systemvoice.rate, 1]),
                            m = a.selectBest([f.collectionvoice.volume, f.systemvoice.volume, 1]),
                            n;
                        null != d && (e *= null != d.pitch ? d.pitch : 1, l *= null != d.rate ? d.rate : 1, m *= null != d.volume ? d.volume : 1, n = d.extraParams || null);
                        e /= 2;
                        l /= 2;
                        m *= 2;
                        e = Math.min(Math.max(e, 0), 1);
                        l = Math.min(Math.max(l, 0), 1);
                        m = Math.min(Math.max(m, 0), 1);
                        e = a.fallbackServicePath + "?t=" + encodeURIComponent(k[g]) + "&tl=" + (f.collectionvoice.lang || f.systemvoice.lang || "en-US") +
                            "&sv=" + (f.collectionvoice.service || f.systemvoice.service || "") + "&vn=" + (f.collectionvoice.voicename || f.systemvoice.voicename || "") + "&pitch=" + e.toString() + "&rate=" + l.toString() + "&vol=" + m.toString();
                        n && (e += "&extraParams=" + JSON.stringify(n));
                        l = document.createElement("AUDIO");
                        l.src = e;
                        l.playbackRate = a.fallback_playbackrate;
                        l.preload = "auto";
                        l.load();
                        a.fallback_parts.push(l)
                    }
                    a.fallbackMode && a.getServiceEnabled(a.services.FALLBACK_AUDIO) && (a.fallback_part_index = 0, a.fallback_startPart());
                    a.log("Service used: " +
                        h)
                }
            } else setTimeout(function () {
                a.speak(b, c, d)
            }, 15)
        };
        a.startTimeout = function (b, c) {
            var d = a.msgprofile.collectionvoice.timerSpeed;
            null == a.msgprofile.collectionvoice.timerSpeed && (d = 1);
            0 >= d || (a.timeoutId = setTimeout(c, a.getEstimatedTimeLength(b, d)), a.log("Timeout ID: " + a.timeoutId))
        };
        a.checkAndCancelTimeout = function () {
            null != a.timeoutId && (clearTimeout(a.timeoutId), a.timeoutId = null)
        };
        a.speech_timedout = function () {
            a.cancel();
            a.cancelled = !1;
            a.speech_onend()
        };
        a.speech_onend = function () {
            a.checkAndCancelTimeout();
            !0 === a.cancelled ? a.cancelled = !1 : (a.log("on end fired"), null != a.msgparameters && null != a.msgparameters.onend && 1 != a.msgparameters.onendcalled && (a.log("Speech on end called  -" + a.msgtext), a.msgparameters.onendcalled = !0, a.msgparameters.onend()))
        };
        a.speech_onstart = function () {
            if (!a.onstartFired) {
                a.onstartFired = !0;
                a.log("Speech start");
                if (a.iOS || a.is_safari || a.useTimer) a.fallbackMode || a.startTimeout(a.msgtext, a.speech_timedout);
                a.msgparameters.onendcalled = !1;
                if (null != a.msgparameters && null != a.msgparameters.onstart) a.msgparameters.onstart()
            }
        };
        a.fallback_startPart = function () {
            0 == a.fallback_part_index && a.speech_onstart();
            a.fallback_audio = a.fallback_parts[a.fallback_part_index];
            if (null == a.fallback_audio) a.log("RV: Fallback Audio is not available");
            else {
                var b = a.fallback_audio;
                a.fallback_audiopool.push(b);
                setTimeout(function () {
                    b.playbackRate = a.fallback_playbackrate
                }, 50);
                b.onloadedmetadata = function () {
                    b.play();
                    b.playbackRate = a.fallback_playbackrate
                };
                a.fallback_errors && (a.log("RV: Speech cancelled due to errors"), a.speech_onend());
                a.fallback_audio.play();
                a.fallback_audio.addEventListener("ended", a.fallback_finishPart);
                a.useTimer && a.startTimeout(a.multipartText[a.fallback_part_index], a.fallback_finishPart)
            }
        };
        a.isFallbackAudioPlaying = function () {
            var b;
            for (b = 0; b < a.fallback_audiopool.length; b++) {
                var c = a.fallback_audiopool[b];
                if (!c.paused && !c.ended && c.currentTime != c.duration) return !0
            }
            return !1
        };
        a.fallback_finishPart = function (b) {
            a.isFallbackAudioPlaying() ? (a.checkAndCancelTimeout(), a.timeoutId = setTimeout(a.fallback_finishPart, 1E3 * (a.fallback_audio.duration -
                a.fallback_audio.currentTime))) : (a.checkAndCancelTimeout(), a.fallback_part_index < a.fallback_parts.length - 1 ? (a.fallback_part_index++, a.fallback_startPart()) : a.speech_onend())
        };
        a.cancel = function () {
            a.checkAndCancelTimeout();
            a.fallbackMode ? (null != a.fallback_audio && a.fallback_audio.pause(), a.clearFallbackPool()) : (a.cancelled = !0, speechSynthesis.cancel())
        };
        a.voiceSupport = function () {
            return "speechSynthesis" in window
        };
        a.OnFinishedPlaying = function (b) {
            if (null != a.msgparameters && null != a.msgparameters.onend) a.msgparameters.onend()
        };
        a.setDefaultVoice = function (b) {
            b = a.getResponsiveVoice(b);
            null != b && (a.default_rv = b)
        };
        a.mapRVs = function () {
            for (var b = 0; b < a.responsivevoices.length; b++)
                for (var c = a.responsivevoices[b], d = 0; d < c.voiceIDs.length; d++) {
                    var h = a.voicecollection[c.voiceIDs[d]];
                    if (1 != h.fallbackvoice) {
                        var k = a.getSystemVoice(h.name);
                        if (null != k) {
                            c.mappedProfile = {
                                systemvoice: k,
                                collectionvoice: h
                            };
                            break
                        }
                    } else {
                        c.mappedProfile = {
                            systemvoice: {},
                            collectionvoice: h
                        };
                        break
                    }
                }
            a.rvsMapped = !0
        };
        a.getMatchedVoice = function (b) {
            for (var c = 0; c < b.voiceIDs.length; c++) {
                var d =
                    a.getSystemVoice(a.voicecollection[b.voiceIDs[c]].name);
                if (null != d) return d
            }
            return null
        };
        a.getSystemVoice = function (b) {
            var c = String.fromCharCode(160);
            b = b.replace(new RegExp("\\s+|" + c, "g"), "");
            if ("undefined" === typeof a.systemvoices || null === a.systemvoices) return null;
            for (var d = 0; d < a.systemvoices.length; d++)
                if (0 === a.systemvoices[d].name.replace(new RegExp("\\s+|" + c, "g"), "").replace(/ *\([^)]*\) */g, "").localeCompare(b)) return a.systemvoices[d];
            return null
        };
        a.getResponsiveVoice = function (b) {
            for (var c = 0; c <
                a.responsivevoices.length; c++)
                if (a.responsivevoices[c].name == b) return !0 === a.responsivevoices[c].mappedProfile.collectionvoice.fallbackvoice || !0 === a.fallbackMode ? (a.fallbackMode = !0, a.fallback_parts = []) : a.fallbackMode = !1, a.responsivevoices[c];
            return null
        };
        a.Dispatch = function (b) {
            if (a.hasOwnProperty(b + "_callbacks") && null != a[b + "_callbacks"] && 0 < a[b + "_callbacks"].length) {
                for (var c = a[b + "_callbacks"], d = 0; d < c.length; d++) c[d]();
                return !0
            }
            var h = b + "_callbacks_timeout",
                k = b + "_callbacks_timeoutCount";
            a.hasOwnProperty(h) ||
                (a[k] = 10, a[h] = setInterval(function () {
                    --a[k];
                    (a.Dispatch(b) || 0 > a[k]) && clearTimeout(a[h])
                }, 50));
            return !1
        };
        a.AddEventListener = function (b, c) {
            a.hasOwnProperty(b + "_callbacks") || (a[b + "_callbacks"] = []);
            a[b + "_callbacks"].push(c)
        };
        a.addEventListener = a.AddEventListener;
        a.clickEvent = function () {
            if (a.iOS && !a.iOS_initialized) {
                a.log("Initializing iOS click event");
                var b = new SpeechSynthesisUtterance(" ");
                speechSynthesis.speak(b);
                a.iOS_initialized = !0
            }
        };
        a.isPlaying = function () {
            return a.fallbackMode ? null != a.fallback_audio &&
                !a.fallback_audio.ended && !a.fallback_audio.paused : speechSynthesis.speaking
        };
        a.clearFallbackPool = function () {
            for (var b = 0; b < a.fallback_audiopool.length; b++) null != a.fallback_audiopool[b] && (a.fallback_audiopool[b].pause(), a.fallback_audiopool[b].src = "");
            a.fallback_audiopool = []
        };
        "interactive" === document.readyState ? a.init() : document.addEventListener("DOMContentLoaded", function () {
            a.init()
        });
        a.selectBest = function (a) {
            for (var b = 0; b < a.length; b++)
                if (null != a[b]) return a[b];
            return null
        };
        a.pause = function () {
            a.fallbackMode ?
                null != a.fallback_audio && a.fallback_audio.pause() : speechSynthesis.pause()
        };
        a.resume = function () {
            a.fallbackMode ? null != a.fallback_audio && a.fallback_audio.play() : speechSynthesis.resume()
        };
        a.tts_speak = function (b) {
            setTimeout(function () {
                a.cancelled = !1;
                speechSynthesis.speak(b)
            }, .01)
        };
        a.setVolume = function (b) {
            if (a.isPlaying())
                if (a.fallbackMode) {
                    for (var c = 0; c < a.fallback_parts.length; c++) a.fallback_parts[c].volume = b;
                    for (c = 0; c < a.fallback_audiopool.length; c++) a.fallback_audiopool[c].volume = b;
                    a.fallback_audio.volume =
                        b
                } else
                    for (c = 0; c < a.utterances.length; c++) a.utterances[c].volume = b
        };
        a.onPartEnd = function (b) {
            if (null != a.msgparameters && null != a.msgparameters.onchuckend) a.msgparameters.onchuckend();
            a.Dispatch("OnPartEnd");
            b = a.utterances.indexOf(b.utterance);
            a.currentMsg = a.utterances[b + 1]
        };
        a.onboundary = function (b) {
            a.log("On Boundary");
            a.iOS && !a.onstartFired && a.speech_onstart()
        };
        a.numToWords = function (b) {
            function c(a) {
                if (Array.isArray(a)) {
                    for (var b = 0, c = Array(a.length); b < a.length; b++) c[b] = a[b];
                    return c
                }
                return Array.from(a)
            }
            var d = function () {
                    return function (a, b) {
                        if (Array.isArray(a)) return a;
                        if (Symbol.iterator in Object(a)) {
                            var c = [],
                                d = !0,
                                e = !1,
                                f = void 0;
                            try {
                                for (var g = a[Symbol.iterator](), h; !(d = (h = g.next()).done) && (c.push(h.value), !b || c.length !== b); d = !0);
                            } catch (r) {
                                e = !0, f = r
                            } finally {
                                try {
                                    if (!d && g["return"]) g["return"]()
                                } finally {
                                    if (e) throw f;
                                }
                            }
                            return c
                        }
                        throw new TypeError("Invalid attempt to destructure non-iterable instance");
                    }
                }(),
                h = function (a) {
                    return 0 === a.length
                },
                k = function (a) {
                    return function (b) {
                        return b.slice(0, a)
                    }
                },
                f = function (a) {
                    return function (b) {
                        return b.slice(a)
                    }
                },
                g = function (a) {
                    return a.slice(0).reverse()
                },
                e = function (a) {
                    return function (b) {
                        return function (c) {
                            return a(b(c))
                        }
                    }
                },
                l = function (a) {
                    return !a
                },
                m = function q(a) {
                    return function (b) {
                        return h(b) ? [] : [k(a)(b)].concat(c(q(a)(f(a)(b))))
                    }
                },
                n = " one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" "),
                p = "  twenty thirty forty fifty sixty seventy eighty ninety".split(" "),
                t = " thousand million billion trillion quadrillion quintillion sextillion septillion octillion nonillion".split(" "),
                u = function (a) {
                    var b = d(a, 3);
                    a = b[0];
                    var c = b[1],
                        b = b[2];
                    return [0 === (Number(b) || 0) ? "" : n[b] + " hundred ", 0 === (Number(a) || 0) ? p[c] : p[c] && p[c] + " " || "", n[c + a] || n[a]].join("")
                },
                v = function (a, b) {
                    return "" === a ? a : a + " " + t[b]
                };
            return "number" === typeof b ? a.numToWords(String(b)) : "0" === b ? "zero" : e(m(3))(g)(Array.from(b)).map(u).map(v).filter(e(l)(h)).reverse().join(" ").trim()
        };
        a.getWords = function (b) {
            for (var c = b.split(/(\s*[\s,]\s*|\?|;|:|\.|\(|\)|!)/), c = c.filter(function (a) {
                    return /[^\s]/.test(a)
                }), d = 0; d < c.length; d++) null !=
                (b = c[d].toString().match(/\d+/)) && (c.splice(d, 1), a.numToWords(+b[0]).split(/\s+/).map(function (a) {
                    c.push(a)
                }));
            return c
        };
        a.getEstimatedTimeLength = function (b, c) {
            var d = a.getWords(b),
                h = 0,
                k = a.fallbackMode ? 1300 : 700;
            c = c || 1;
            d.map(function (a, b) {
                h += (a.toString().match(/[^ ]/igm) || a).length
            });
            var f = d.length,
                g = 60 / a.WORDS_PER_MINUTE * c * 1E3 * f;
            5 > f && (g = c * (k + 50 * h));
            a.log("Estimated time length: " + g + " ms, words: [" + d + "], charsCount: " + h);
            return g
        };
        a.services = {
            NATIVE_TTS: 0,
            FALLBACK_AUDIO: 1
        };
        a.servicesPriority = [0, 1];
        a.servicesEnabled = [];
        a.setServiceEnabled = function (b, c) {
            a.servicesEnabled[b] = c
        };
        a.getServiceEnabled = function (b) {
            return a.servicesEnabled[b] || !1
        };
        a.setServiceEnabled(a.services.NATIVE_TTS, !0);
        a.setServiceEnabled(a.services.FALLBACK_AUDIO, !0)
    },
    responsiveVoice = new ResponsiveVoice;
(function () {
    'use strict';
    angular
        .module('aiaVaUi')
        .factory('_', LodashFactory);

    LodashFactory.$inject = ['$window', '$log'];

    function LodashFactory($window, $log) {
        if (!$window._) {
            $log.error("Warning: Lodash not available in $window!");
        }

        return $window._;
    }

})();

(function () {
    'use strict';

    angular.module('aiaVaUi')

        .filter('isDangerConfidence', function () {
            return function (confidence) {
                return confidence < 0.3;
            };
        })

        .filter('confidenceIndicator', ['$sce', function ($sce) {
            return function (confidence) {

                var classNames;

                if (confidence > 0.8) {
                    classNames = "fa-circle text-navy";
                } else if (confidence > 0.5) {
                    classNames = "fa-circle text-warning"
                } else if (confidence > 0.3) {
                    classNames = "fa-circle text-danger"
                } else if (angular.isNumber(confidence)) {
                    classNames = "fa-exclamation-triangle text-danger"
                } else {
                    classNames = "fa-fw";
                }

                return "<i class='fa " + classNames + "'></i>"
            };
	}]);


})();
(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .controller('CallController', CallController);

    /** @ngInject */
    function CallController($timeout, toastr, ChatService, $scope,
        VoiceRecognitionService) {
        var vm = this;

        var recorder;

        ChatService.bindConversation(vm, 'conversation');

        var handleError = function () {
            toastr.error("There was an unexpected error");
            vm.isErrored = true;
            vm.end();
        }

        var handleChatResponse = function (replyText) {
            responsiveVoice.speak(replyText, "UK English Female", {
                onstart: function () {
                    console.log("TTS started");
                    $timeout(function () {
                        vm.state = "SPEAKING";
                    });
                },
                onend: function () {
                    console.log("TTS ended. restarting voice recognition.");
                    vm.startRecord();
                }
            });
        }

        vm.initialize = function () {
            vm.state = "STARTING"; //initial state

            //setup the recorder
            recorder = new Recorder({
                monitorGain: 0,
                numberOfChannels: 1,
                bitDepth: 16,
                recordOpus: false,
                sampleRate: 16000,
                workerPath: 'vendor/recorderWorker.js'
            });

            recorder.addEventListener("streamReady", function (e) {
                console.log('stream is ready');
            });
            recorder.addEventListener("start", function (e) {});
            recorder.addEventListener("stop", function (e) {});

            recorder.addEventListener("dataAvailable", function (e) {
                console.log(vm.state);
                if (!vm.state) return;

                // skip this data if instructed
                if (vm.skipNextData) {
                    vm.skipNextData = false; //then flip the switch back
                    console.log('not sending audio this time...')
                    return;
                }

                $timeout(function () {
                    vm.state = "PROCESSING";
                });

                console.log('audio received, sending to server...');

                var dataFile = new Blob([e.detail], {
                    type: 'audio/wav'
                });
                var fileName = new Date().toISOString() + ".wav";

                //send to server
                VoiceRecognitionService.getTextFromAudioFile(dataFile)
                    .success(function (res) {
                        console.log(res);
                        if (res.data) {
                            var input = VoiceRecognitionService.processDictatedText(res.data);

                            ChatService.processUserMessage(input)
                                .then(function (replyMsg) {
                                    handleChatResponse(replyMsg.text);
                                });
                        } else {
                            toastr.warning("We could not understand what you said, please try again.");
                            vm.startRecord();
                        }
                    })
                    .error(function (err) {
                        console.error(err);
                        handleError();
                    });

            });

            recorder.initStream();

            startConversation();
        }

        vm.sendTextMsg = function () {
            if (vm.textInput) {
                var text = vm.textInput;

                vm.textInput = ""; //clear the input    

                //if the voice is speaking, stop speaking
                if (responsiveVoice.isPlaying()) {
                    responsiveVoice.cancel();
                }

                // if the recording is recording, stop recording
                // and instruct to ignore next datareceived
                if (vm.state === "RECORDING") {
                    vm.skipNextData = true;
                    vm.stopRecord();
                }

                //send the message
                ChatService.processUserMessage(text)
                    .then(function (replyMsg) {
                        handleChatResponse(replyMsg.text);
                    });
            }
        }

        var startConversation = function () {

            vm.showConvo = true;

            console.log('sending first message');
            ChatService.processUserMessage("start", null, null, null, true)
                .then(function (replyMsg) {

                    // recognition.start();   
                    responsiveVoice.speak(replyMsg.text, "UK English Female", {
                        onstart: function () {
                            $timeout(function () {
                                console.log("TTS started");
                            })
                        },
                        onend: function () {
                            $timeout(function () {
                                vm.state = "RECORDING";
                                console.log("TTS ended. restarting voice recognition.");
                                vm.startRecord();
                            })
                        }
                    });
                })
                .catch(function (err) {
                    handleError();
                })
        }



        var reset = function () {
            vm.state = "IDLE"; //["RECORDING", "PROCESSING"]
        }

        vm.startRecord = function () {
            $timeout(function () {
                if (angular.isDefined(recorder)) {
                    recorder.start();
                    vm.state = "RECORDING";
                }

            });
        }

        vm.stopRecord = function () {
            $timeout(function () {
                if (angular.isDefined(recorder)) {
                    vm.state = "IDLE";
                    recorder.stop();
                }
            });
        }

        vm.end = function () {

            if (responsiveVoice.isPlaying()) {
                responsiveVoice.cancel();
            }

            vm.state = null;
            console.log(vm.state);

            $timeout(function () {
                recorder.stop();
            });
        }



    }
})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .controller('MetaDataPanelController', MetaDataPanelController);

    /** @ngInject */
    function MetaDataPanelController($timeout, $scope, DocumentParserService,
        $stateParams, $rootScope, toastr, $location) {
        var vm = this;


        DocumentParserService.bindToWorkingDocument($stateParams.docId, vm, 'document');

        DocumentParserService.bindToWorkingDocumentMetadata($stateParams.docId, vm, 'metadata');

        DocumentParserService.bindToWorkingDocumentDatapoints($stateParams.docId, vm, 'datapoints');

        vm.viewDatapoint = function (dp) {
            $rootScope.$broadcast('documentviewer:viewDatapoint', dp);
        }

        vm.removeDatapoint = function (item) {
            item.isDeleted = true;
            vm.datapoints.$save(item).then(function () {
                console.log('dp removed');
                toastr.success("Datapoint was removed");
            });
        }

        vm.updateDatapoint = function ($data, datapoint, property) {
            console.log($data);
            datapoint[property] = $data;
            datapoint.updatedTimestamp = new Date().getTime();
            return vm.datapoints.$save(datapoint).then(function () {
                console.log('updated dp');
                toastr.success("Updated Datapoint");
                return true;
            })
        }

        vm.confirmResults = function () {
            vm.loading = DocumentParserService.confirmExtractedResultsForDocument($stateParams.docId)
                .then(function () {
                    console.log('doc saved');
                    toastr.success("Data Extraction Results Confirmed");
                })
        }

        vm.numChecked = 0;
        $scope.$watch('vm.metadata.checklist', function (val) {
            if (val && val.length) {

                var groupedDatapoints = _.groupBy(vm.metadata.datapoints, 'name');

                //evaluate checklist status
                val.forEach(function (cl) {
                    // find the matching datapoint
                    var datapoint = groupedDatapoints[cl.name][0];
                    cl.status = datapoint.value.toLowerCase() == cl.input.toLowerCase() ? 'CHECKED' : "FAILED"
                });

                vm.metadata.checklist = val;

                vm.numChecked = _.filter(val, function (check) {
                    return check.status === 'CHECKED';
                }).length;
            }

        });

        $scope.$watch('vm.metadata.datapoints.length', function (newVal, oldVal) {
            if (!newVal && oldVal) {
                console.log('Unexpectedly lost datapoints data... routing back to parent');
                $location.path('/employee-approver');
            }

        });


    }
})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .controller('DocumentPanelController', DocumentPanelController);

    /** @ngInject */
    function DocumentPanelController($timeout, $q, $state, $scope, $rootScope, DocumentParserService, $stateParams) {
        var vm = this;

        $rootScope.$on('documentviewer:viewDatapoint', function (event, datapoint) {
            console.log('got the dp', datapoint);

            // create the annotation(s)
            vm.annotations = datapoint.positions;
            console.log(vm.annotations)
        });

        DocumentParserService.bindToWorkingDocument($stateParams.docId, vm, 'document');

        $scope.$watch('vm.document.metadata', function () {
            if (vm.document.metadata && vm.document.metadata.url) {

                $timeout(function () {
                    loadDocument(vm.document.metadata.url)
                });
            }
        });

        var _pdf;

        var loadDocument = function (url) {
            var deferred = $q.defer();

            //load the document
            PDFJS.getDocument(url)
                .then(function (pdf) {
                    _pdf = pdf;

                    return vm.getPage(1).then(function () {
                        console.log('done');
                        deferred.resolve();
                    })

                });

            vm.loading = deferred.promise;
        }


        vm.getPage = function (pageNum) {
            // Fetch the first page page.
            return _pdf.getPage(pageNum).then(function (page) {
                var scale = 1;
                var viewport = page.getViewport(scale);

                // Prepare canvas using PDF page dimensions.
                var canvas = document.getElementById('the-canvas');
                var context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                // Render PDF page into canvas context.
                var renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                page.render(renderContext);
            });
        }
    }
})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .controller('EmployeeApproverMainController', EmployeeApproverMainController);

    /** @ngInject */
    function EmployeeApproverMainController($timeout, $scope,
        DocumentParserService, toastr, $firebaseArray, $stateParams) {
        var vm = this;

        vm.logoImg = "https://s-media-cache-ak0.pinimg.com/736x/4c/c1/43/4cc1434a6cee647a879155d08e6f82f3.jpg";
        vm.logoImg = "https://s-media-cache-ak0.pinimg.com/736x/4c/c1/43/4cc1434a6cee647a879155d08e6f82f3.jpg";

        vm.documentList = [];

        var activate = function () {
            vm.showDropzone = $stateParams.showUpload;
            vm.appId = $stateParams.applicationId;
            DocumentParserService.bindWorkingDocuments(vm, 'documentList');
        }

        activate(); //initial load

        vm.clearDropzone = function () {
            $timeout(function () {
                vm.dzMethods.removeAllFiles();
            });
        };

        vm.dzCallbacks = {
            'addedfile': function (file) {
                console.log(file);
                vm.tempDocument = undefined;
                vm.tempDocument = {
                    filename: file.name
                };


            },
            'success': function (file, xhr) {
                console.log(file, xhr);
            }
        };

    }
})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .controller('ApplyFormController', ApplyFormController);

    /** @ngInject */
    function ApplyFormController($timeout, $scope, $state,
        DocumentParserService, toastr, $firebaseArray, $stateParams) {
        var vm = this;

        vm.logoImg = "https://s-media-cache-ak0.pinimg.com/736x/4c/c1/43/4cc1434a6cee647a879155d08e6f82f3.jpg";

        vm.documentList; //this is a firebase array

        vm.uploadingDocsList = []; //temp list of uploading docs.    

        vm.appFormApi = {}; //the interface to application-form component

        var activate = function (userId) {
            vm.userId = userId;
            DocumentParserService.setWorkingDocSubPath(userId);

            vm.loading = DocumentParserService
                .bindWorkingDocuments(vm, 'documentList',
                    function (event) {
                        evaluateDocumentMetadata();
                    })
                .$loaded();
        }

        // before activating, prompt the user for a userID for the session,
        // so multiple users using this demo won't end up sharing the same
        // realtime DB
        var checkUser = function () {
            var userId = _.snakeCase($stateParams.userId); //use #snakeCase to conveniently clean the input, leaving only alphanum_alphanum

            if (userId) {
                activate(userId); //initial load  
            } else {
                var userId = prompt("Please provide your user ID (avoid symbols)");

                if (userId) {
                    $state.go('.', {
                        userId: userId
                    });
                } else {
                    checkUser(); // trigger prompt again if userId is not valid
                }
            }
        }

        checkUser(); // code entry point


        var evaluateDocumentMetadata = function () {

            //clear all fields
            vm.appFormApi.clearAllFields();

            // extract all the datapoints
            var datapoints = [];
            vm.documentList.forEach(function (doc) {
                if (doc.metadata) {
                    // add the document url to each datapoint child, so they can be referenced independently
                    var dps = doc.metadata.datapoints.map(function (dp) {
                        dp.documentUrl = doc.metadata.url;
                        dp.dpi = doc.metadata.dpi;
                        return dp;
                    });

                    datapoints = datapoints.concat(dps);
                }
            });

            //group datapoints by dataKey
            var groupedDp = _.groupBy(datapoints, 'dataKey');

            // send the data to application form component
            angular.forEach(groupedDp, function (dps, dataKey) {
                vm.appFormApi.setDataForDataKey(dataKey, dps);
            });

        }

        vm.clearDropzone = function (uploadingFileIndex) {
            $timeout(function () {
                vm.dzMethods.removeAllFiles();
            });

            _.pullAt(vm.uploadingDocsList, uploadingFileIndex);
        };

        vm.dzCallbacks = {
            'addedfile': function (file) {
                console.log(file);
                $timeout(function () {
                    vm.uploadingDocsList.push({
                        filename: file.name
                    });
                })
            },
            'success': function (file, xhr) {
                console.log(file, xhr);
            }
        };

    }
})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .controller('ApplyDoneController', ApplyDoneController);

    /** @ngInject */
    function ApplyDoneController($timeout, $scope, $state,
        DocumentParserService, toastr, $firebaseArray, $stateParams) {
        var vm = this;

        vm.userId = $stateParams.userId;

    }
})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .run(runBlock);

    /** @ngInject */
    function runBlock($log, editableOptions) {

        $log.debug('runBlock end');

        editableOptions.theme = 'bs3'; // bootstrap3 theme. Can be also 'bs2', 'default'
    }

})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .config(routerConfig);

    /** @ngInject */
    function routerConfig($stateProvider, $urlRouterProvider) {
        $stateProvider
            // .state('home', {
            //   url: '/demo1',
            //   templateUrl: 'app/main/main.html',
            //   controller: 'MainController',
            //   controllerAs: 'main'
            // })
            //
            // .state('streaming', {
            //   url: '/demo4',
            //   templateUrl: 'app/main/main.html',
            //   controller: 'SocketStreamingController',
            //   controllerAs: 'main'
            // })
            //
            // .state('persistantChunks', {
            //   url: '/demo5',
            //   templateUrl: 'app/persistant/persistant.html',
            //   controller: 'PersistantStreamingWithChunksController',
            //   controllerAs: 'vm'
            // })
            //
            // .state('persistant', {
            //   url: '/demo6',
            //   templateUrl: 'app/persistant/persistant.html',
            //   controller: 'PersistantStreamingController',
            //   controllerAs: 'vm'
            // })
            //
            // .state('call', {
            //   url: '/demo2',
            //   templateUrl: 'app/call/call.html',
            //   controller: 'CallController',
            //   controllerAs: 'vm'
            // })

            // .state('approver', {
            //   url: '/approver/{applicationId}?showUpload',
            //   templateUrl: 'app/approver/approver-main.html',
            //   controller: 'EmployeeApproverMainController',
            //   controllerAs: 'vm'
            // })

            // .state('approver.view-document', {
            //   url: '/document/{docId}',
            //   views: {
            //     'documentPanel@approver': {
            //       templateUrl: 'app/approver/document-panel.html',
            //       controller: 'DocumentPanelController',
            //       controllerAs: 'vm'
            //     },
            //     'metaDataPanel@approver': {
            //       templateUrl: 'app/approver/metadata-panel.html',
            //       controller: 'MetaDataPanelController',
            //       controllerAs: 'vm'
            //     }
            //   },
            //   controller: 'DocumentViewController',
            //   controllerAs: 'vm'
            // })

            .state('apply', {
                url: '/apply?userId',
                templateUrl: 'app/apply-form/apply-form.html',
                controller: 'ApplyFormController',
                controllerAs: 'vm'
            })

            .state('apply-success', {
                url: '/apply-success?userId',
                templateUrl: 'app/apply-form/apply-done.html',
                controller: 'ApplyDoneController',
                controllerAs: 'vm'
            })




        $urlRouterProvider.otherwise('/apply');
    }

})();

/* global malarkey:false, moment:false */
(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .constant('malarkey', malarkey)
        .constant('moment', moment);

})();

(function () {
    'use strict';

    angular
        .module('aiaVaUi')
        .config(config);

    /** @ngInject */
    function config($logProvider, toastrConfig, dropzoneOpsProvider) {
        // Enable log
        $logProvider.debugEnabled(true);

        // Set options third-party lib
        toastrConfig.allowHtml = true;
        toastrConfig.timeOut = 3000;
        toastrConfig.positionClass = 'toast-top-center';
        toastrConfig.preventDuplicates = true;
        toastrConfig.progressBar = true;


        dropzoneOpsProvider.setOptions({
            url: '/upload_url',
            maxFilesize: '10'
        });


    }

})();

angular.module("aiaVaUi").run(["$templateCache", function ($templateCache) {
    $templateCache.put("app/apply-form/apply-done.html", "<br><br><br><div class=container><div class=\"text-center banner-holder\"><img src=https://www.ipb.citibank.com.sg/english/static/images/overviewBanner/step-by-step-guide.jpg><div class=banner-text-overlay><h2>Thank you for applying via Taiger iMatch</h2><h3>We hope to serve you again!</h3></div><br><br><br><a ui-sref=\"apply({userId: vm.userId})\" class=\"btn btn-rounded btn-lg btn-success\">Submit Another Application</a></div></div>");
    $templateCache.put("app/apply-form/apply-form.html", "<div class=\"gray-bg top-navigation\"><div class=\"row border-bottom white-bg\"><nav class=\"navbar navbar-static-top\" role=navigation><div class=navbar-header><button aria-controls=navbar aria-expanded=false data-target=#navbar data-toggle=collapse class=\"navbar-toggle collapsed\" type=button><i class=\"fa fa-reorder\"></i></button> <a href=# class=navbar-brand><b>Apply For New Credit Card</b></a></div><div class=\"navbar-collapse collapse\" id=navbar><ul class=\"nav navbar-top-links navbar-right\"><li><!-- <img ng-src=\"{{vm.logoImg}}\" width=\"108\"/> --></li></ul></div></nav></div><!-- Start: Left-most panel --><div class=\"col-xs-6 nomargins nopaddings\"><div class=\"row nomargins document-upload-panel\"><!-- Start: Dropzone --><div class=\"ibox nomargins border-bottom col-xs-6\"><div class=ibox-title><h5>Add Application Document</h5></div><div class=\"ibox-content scroll-y dropzone-area\"><div class=dropzone callbacks=vm.dzCallbacks methods=vm.dzMethods ng-dropzone></div></div></div><!-- End: Dropzone --><!-- Start: Document list --><div class=\"ibox nomargins border-bottom col-xs-6\" cg-busy=vm.loading><div class=ibox-title><h5>Application Documents</h5></div><div class=\"ibox-content scroll-y nopaddings\"><ul class=\"list - group elements - list nomargins\"><li ng-if=\"!vm.uploadingDocsList.length && !vm.documentList.length\" class=text-center><br><br><h4 class=text-muted>No Documents In Process</h4></li><li document-list-item ng-if=vm.uploadingDocsList.length class=list-group-item ng-repeat=\"uploadingDoc in vm.uploadingDocsList\" on-processed=vm.clearDropzone($index) document=uploadingDoc></li><li class=\"list-group-item no-hover-bg\" ng-repeat=\"doc in vm.documentList | orderBy:\'-timestamp\'\"><document-list-item hide-arrow-icon=true delete-clicked=vm.documentList.$remove(doc) document=doc></document-list-item></li></ul></div></div><!-- END: Document list --></div><application-form user-id=vm.userId api=vm.appFormApi document-viewer-api=vm.documentViewerApi></application-form></div><!-- END: Left-most panel --><!-- Start: Document & Data Section --><div hl-sticky=\"\" class=\"col-xs-6 nomargins nopaddings\"><document-viewer api=vm.documentViewerApi></document-viewer></div><!-- END: Document & Data Section --></div>");
    $templateCache.put("app/call/call.html", "<div class=container><div class=row><div class=col-lg-4><br><br><h2>AIA VA Demo 2</h2><br><h4>Usage</h4><ol class=small><li>Press <b>Start Call</b> to start the conversation</li><li>Please speak only after the VA completes her sentence</li><li>Press <b>Click here when done speaking</b> to process your input</li><li>Press <b>End Call</b> to end the conversation</li></ol><h4>Users</h4>The VA has some fake users with different GL status. Try the following Membership Numbers.<table class=\"table table-condensed table-bordered table-striped\"><tbody><tr><th style=width:10% class=text-center>Member ID</th><th style=\"vertical-align: middle\">GL status</th><th style=\"vertical-align: middle\">RL status</th></tr><tr><td class=text-center>1</td><td>No GLs</td><td>Not received</td></tr><tr><td class=text-center>2</td><td>Declined GLs</td><td>Not received</td></tr><tr><td class=text-center>3</td><td>1 approved GL</td><td>Received / Issued</td></tr><tr><td class=text-center>4</td><td>Some declined GLs</td><td>Received / Unknown</td></tr><tr><td class=text-center>5</td><td>Many approved GLs</td><td>Received / Rejected</td></tr><tr><td class=text-center>6</td><td>VVIP</td><td>Not received</td></tr></tbody></table><h4>Enquiries</h4>The VA currently has the following enquiries available.<ul><li>hi</li><li>bye</li><li>start</li><li>gl status</li><li>rl status</li><li>refax gl</li><li>room</li></ul></div><div class=col-lg-6><div class=\"center-align text-center\"><br><br><div ng-if=\"vm.isErrored === true\" class=\"alert alert-danger\"><b>We\'re sorry</b>, something went wrong. Please contact Taiger for more assistance. Thank you.</div><!-- <h1><b>AIA</b><br>Virtual Assistant Demo</h1> --><br><br><br><br><button ng-disabled=\"vm.state && vm.state !== \'IDLE\'\" ng-click=vm.initialize() class=\"btn btn-lg btn-success\" style=width:50%><span ng-if=!vm.state><i class=\"fa fa-phone\"></i> Start Call </span><span ng-if=\"vm.state === \'STARTING\'\">STARTING UP... </span><span ng-if=\"vm.state === \'RECORDING\'\"><i class=\"fa fa-circle blink\"></i> Waiting For Audio </span><span ng-if=\"vm.state === \'PROCESSING\'\"><i class=\"fa fa-cog fa-spin\"></i> Processing Audio... </span><span ng-if=\"vm.state === \'SPEAKING\'\">SPEAKING... </span><span ng-if=\"vm.state === \'IDLE\'\">WAIT</span></button><br><br><button ng-disabled=\"vm.state === \'PROCESSING\'\" ng-if=\"vm.state === \'RECORDING\'\" class=\"btn btn-default\" ng-click=vm.stopRecord()><span class=text-danger><i class=\"fa fa-microphone-slash\"></i>&nbsp;Click here when done speaking</span></button><br><br><button ng-disabled=\"vm.state === \'PROCESSING\'\" ng-if=vm.state class=\"btn btn-default\" ng-click=vm.end()><span class=text-danger><i class=\"fa fa-stop-circle-o\"></i>&nbsp;End Call</span></button></div><br><br><div class=\"panel panel-default center-block\" style=width:80%><div class=\"panel-heading panel-heading-thin\"><b>Live Conversation Log</b></div><div id=iconverse class=panel-body ng-if=\"vm.showConvo === true\" style=\"height: 250px; max-height:500px; overflow-y:scroll\" scroll-glue><div class=chat-log><chat-bubble message=msg ng-repeat=\"msg in vm.conversation\"></chat-bubble><br></div></div><div class=\"panel-body nomargins\" style=\"border-top: 1px solid #CCC\" ng-if=vm.showConvo><form class=form-inline ng-submit=vm.sendTextMsg()><input type=text ng-model=vm.textInput placeholder=\"You can also type to chat here...\" class=form-control style=width:100%></form></div></div></div></div></div>");
    $templateCache.put("app/approver/approver-main.html", "<div class=\"gray-bg top-navigation\"><div class=\"row border-bottom white-bg\"><nav class=\"navbar navbar-static-top\" role=navigation><div class=navbar-header><button aria-controls=navbar aria-expanded=false data-target=#navbar data-toggle=collapse class=\"navbar-toggle collapsed\" type=button><i class=\"fa fa-reorder\"></i></button> <a href=# class=navbar-brand><b>Application Document Reviewer</b></a></div><div class=\"navbar-collapse collapse\" id=navbar><ul class=\"nav navbar-top-links navbar-right\"><li><img ng-src={{vm.logoImg}} width=108></li></ul></div></nav></div><div style=\"padding-bottom: 10px\" class=\"row wrapper border-bottom white-bg page-heading\"><div class=col-sm-6><h2>Processing Application Ref: <b>{{vm.appId}}</b></h2><!--       <dl class=\"dl-horizontal\">\n          <dt class=\"\">Created by:</dt> <dd>Alex Smith</dd>\n          <dt>Messages:</dt> <dd>  162</dd>\n          <dt>Client:</dt> <dd><a href=\"#\" class=\"text-navy\"> Zender Company</a> </dd>\n          <dt>Version:</dt> <dd>  v1.4.2 </dd>\n      </dl> --></div></div><!-- Start: Left-most panel --><div class=\"col-xs-3 nomargins nopaddings\"><!-- Start: Dropzone --><div ng-if=vm.showDropzone class=\"ibox nomargins\"><div class=ibox-title><h5>Add Application Document</h5></div><div class=\"ibox-content dropzone-area\"><div class=dropzone callbacks=vm.dzCallbacks methods=vm.dzMethods ng-dropzone></div></div></div><!-- End: Dropzone --><!-- Start: Document list --><div class=\"ibox border-bottom\" cg-busy=vm.loading><div class=ibox-title><h5>Application Documents</h5></div><div class=\"ibox-content nopaddings\"><ul class=\"list-group elements-list nomargins\"><li ng-if=\"!vm.tempDocument && !vm.documentList.length\" class=\"list-group-item text-center\"><h4 class=text-muted>No Documents In Process</h4></li><li ng-if=\"vm.tempDocument && !vm.tempDocument.hasLoaded\" class=list-group-item><document-list-item on-processed=vm.clearDropzone() document=vm.tempDocument></document-list-item></li><li ui-sref-active=active class=\"list-group-item pointable\" ng-repeat=\"doc in vm.documentList | orderBy:\'-timestamp\'\"><document-list-item delete-clicked=vm.documentList.$remove(doc) document=doc></document-list-item></li></ul></div></div><!-- END: Document list --></div><!-- END: Left-most panel --><!-- Start: Document & Data Section --><div class=\"col-xs-9 nopaddings\"><div class=\"row nomargins\"><div class=\"col-xs-6 nomargins nopaddings\"><div ui-view=metaDataPanel></div></div><div class=\"col-xs-6 nomargins nopaddings\"><div ui-view=documentPanel></div></div></div></div><!-- END: Document & Data Section --></div>");
    $templateCache.put("app/approver/document-panel.html", "<div ng-if=vm.document.metadata.url class=\"ibox nomargins border-left\"><div class=ibox-title><h5>Document Viewer</h5></div><div cg-busy=vm.loading class=\"ibox-content nopaddings border-bottom\"><div class=pdf-holder><div class=annotation ng-repeat=\"item in vm.annotations\" style=\"width: {{item.width}}px; top:{{item.top}}px; height:{{item.height}}px; left: {{item.left}}px\"></div><canvas id=the-canvas style=width:600px></div></div></div>");
    $templateCache.put("app/approver/metadata-panel.html", "<div cg-busy=vm.loading><!-- Start: Data Extraction Results list --><div class=\"ibox nomargins data-extraction border-left\"><div class=ibox-title><h5>Data Extraction Results</h5></div><div class=ibox-content ng-class=\"{\'nopaddings\': vm.datapoints.length}\"><h4 class=\"text-center text-muted\" ng-if=!vm.datapoints.length>No Datapoints Extracted.<br>Please check that you uploaded the correct document.</h4><table ng-if=vm.datapoints.length class=\"table nomargins\"><tbody><tr ng-if=!dp.isDeleted ui-sref=. ng-repeat=\"dp in vm.datapoints\"><td class=project-status style=width:10%><i ng-if=\"dp.confidence === \'HIGH\'\" class=\"fa-circle fa text-navy\"></i> <i ng-if=\"dp.confidence === \'MODERATE\'\" class=\"fa-circle fa text-warning\"></i> <i ng-if=\"dp.confidence === \'LOW\'\" class=\"fa-circle fa text-danger\"></i></td><td class=project-title><small>{{dp.name | uppercase}}</small><br><div ng-if=!vm.document.isConfirmed class=popover-wrapper><a href=# buttons=no onbeforesave=\"vm.updateDatapoint($data, dp, \'value\')\" editable-text=dp.value><b>{{dp.value | uppercase}}</b></a></div><b ng-if=vm.document.isConfirmed>{{dp.value | uppercase}}</b><div ng-if=dp.updatedTimestamp><small>Updated by Kevin Q. on {{dp.updatedTimestamp | amDateFormat:\"DD/MM/YYYY @ hh:mm a\"}}</small></div></td><td class=project-actions><button ng-click=vm.viewDatapoint(dp) class=\"btn btn-white btn-xs\"><i class=\"fa fa-eye\"></i> View</button> <button ng-click=vm.removeDatapoint(dp) ng-if=!vm.document.isConfirmed class=\"btn btn-danger btn-xs\"><i class=\"fa fa-times\"></i> Remove</button></td><td></td></tr></tbody></table></div></div><!-- End: Data Extraction Results list --><!-- Start: Approval Checklist --><div ng-if=vm.metadata.checklist class=\"ibox nomargins border-bottom border-left data-extraction\"><div class=ibox-title><h5>Approval Checklist ({{vm.numChecked}} / {{vm.metadata.checklist.length}})</h5></div><div class=\"ibox-content nopaddings\"><table class=\"table nomargins\"><tbody><tr ui-sref=. ng-repeat=\"item in vm.metadata.checklist\"><td class=\"project-status text-center\"><i ng-if=\"item.status === \'FAILED\'\" class=\"fa fa-times fa-2x text-danger\"></i> <i ng-if=\"item.status === \'CHECKED\'\" class=\"fa fa-check-square fa-2x text-navy\"></i> <i ng-if=\"item.status === \'UNCHECKED\'\" class=\"fa fa-square-o fa-2x text-default\"></i></td><td class=project-title><b>{{item.name}}</b><br><small><i uib-tooltip=\"Application Form Input\" class=\"fa fa-file text-muted\"></i> &nbsp;{{item.input}}</small></td></tr></tbody></table></div><div ng-if=vm.metadata.checklist class=\"ibox-content confirm-btn-panel\"><button ng-disabled=vm.document.isConfirmed ng-click=vm.confirmResults() class=\"btn btn-block btn-sm btn-primary\">{{vm.document.isConfirmed ? \'Document Approved!\' : \'Approve This Document\'}}</button></div></div><!-- End: Approval Checklist --></div>");
    $templateCache.put("app/main/main.html", "<div class=container><div class=row><div class=col-lg-4><br><br><h2>AIA VA {{main.versionName}}</h2><h5>{{main.versionSub}}</h5><h6 ng-if=main.versionNum>Version {{main.versionNum}}</h6><br><h4>Usage</h4><ul><li>Press <code>Start Call</code> to start the conversation</li><li>Please speak only when the VA\'s status is <code>Listening</code></li><li>Speak close to the microphone as though speaking into a phone</li><li>The call may be <code>Paused</code> if no audio is detected. If this happens, press <code>Resume</code> to resume the call.</li><li>Press <code>End Call</code> to end the conversation</li></ul><h4>Users</h4><p>The VA has some fake users with different GL status. Try the following Membership Numbers.</p><table class=\"table table-condensed table-bordered table-striped\"><tbody><tr><th style=width:10% class=text-center>Member ID</th><th style=\"vertical-align: middle\">GL status</th><th style=\"vertical-align: middle\">RL status</th></tr><tr><td class=text-center>1</td><td>No GLs</td><td>Not received</td></tr><tr><td class=text-center>2</td><td>Declined GLs</td><td>Not received</td></tr><tr><td class=text-center>3</td><td>1 approved GL</td><td>Received / Issued</td></tr><tr><td class=text-center>4</td><td>Some declined GLs</td><td>Received / Unknown</td></tr><tr><td class=text-center>5</td><td>Many approved GLs</td><td>Received / Rejected</td></tr><tr><td class=text-center>6</td><td>VVIP</td><td>Not received</td></tr></tbody></table><h4>Enquiries</h4><p>The VA currently has the following enquiries available.</p><ul><li>hi</li><li>bye</li><li>start</li><li>gl status</li><li>rl status</li><li>refax gl</li><li>room</li></ul></div><div class=col-lg-6><div class=\"center-align text-center\"><br><br><div ng-if=\"main.isErrored === true\" class=\"alert alert-danger\"><div ng-if=!main.errorType><b>We\'re sorry</b>, something went wrong. Please contact Taiger for more assistance. Thank you.</div><div ng-if=\"main.errorType == \'TTS_ERROR\'\"><b>Error: </b>There was an error with Text-To-Speech.</div><div ng-if=\"main.errorType == \'MIC_ERROR\'\"><b>Error: </b>We were unable to access your microphone. Please allow this page to access your microphone, then refresh the page.</div><div ng-if=\"main.errorType == \'SPEECHSERVER_CONNECTION_ERROR\'\"><b>Error: </b>Please navigate to <a href=https://aia-dev.taiger.com:8080>https://aia-dev.taiger.com:8080</a> and add a security exception for the page. Then, return to this page and press \'Start Call\' again.</div></div><!-- <h1><b>AIA</b><br>Virtual Assistant Demo</h1> --><br><br><br><br><button ng-disabled=\"main.isErrored || main.state !== \'IDLE\' || main.state === \'PAUSED\'\" ng-click=main.initialStart() class=\"btn btn-lg btn-success\" style=width:50%><span ng-if=\"main.state === \'IDLE\'\"><i class=\"fa fa-phone\"></i> Start Call </span><span ng-if=\"main.state === \'STARTING\'\">STARTING UP... </span><span ng-if=\"main.state === \'RECORDING\'\"><i class=\"fa fa-circle blink\"></i> Listening... </span><span ng-if=\"main.state === \'PREPARING\'\"><i class=\"fa fa-exclamation-circle\"></i> WAIT </span><span ng-if=\"main.state === \'SPEAKING\'\"><i class=\"fa fa-exclamation-circle\"></i> Speaking... </span><span ng-if=\"main.state === \'PAUSED\'\"><i class=\"fa fa-circle\"></i> Call Paused </span><span ng-if=\"main.state === \'PROCESSING\'\"><i class=\"fa fa-cog fa-spin\"></i> Thinking...</span></button> <button ng-if=\"main.state === \'RECORDING\'\" class=\"btn btn-default\" ng-click=main.stop()><span class=text-danger><i class=\"fa fa-stop-circle-o\"></i>&nbsp;Hang Up</span></button><br><br><button class=\"btn btn-default\" ng-if=main.canRestart ng-click=main.resume()>Resume</button></div><br><br><br><div class=\"panel panel-default center-block\" style=width:80%><div class=\"panel-heading panel-heading-thin\" ng-click=\"main.showConvo = !main.showConvo\"><b>Live Conversation Log</b> <i class=\"pull-right fa\" ng-class=\"{\'fa-chevron-left\': !main.showConvo, \'fa-chevron-down\' : main.showConvo}\"></i></div><div id=iconverse class=panel-body ng-if=\"main.showConvo === true\" style=\"height: 300px; max-height:500px; overflow-y:scroll\" scroll-glue><div class=chat-log><chat-bubble message=msg ng-repeat=\"msg in main.conversation\"></chat-bubble><br></div></div><div class=\"panel-body nomargins\" style=\"border-top: 1px solid #CCC\" ng-if=main.showConvo><form class=form-inline ng-submit=main.sendTextMsg()><input type=text ng-model=main.textInput placeholder=\"You can also type to chat here...\" class=form-control style=width:100%></form></div></div></div></div><div class=row><logger-panel api=main.logPanel></logger-panel></div></div>");
    $templateCache.put("app/persistant/persistant.html", "<div class=container><div class=row><div class=col-lg-4><br><br><h2>AIA VA {{vm.versionName}}</h2><h5>{{vm.versionSub}}</h5><h6 ng-if=vm.versionNum>Version {{vm.versionNum}}</h6><br><h4>Usage</h4><ul><li>Connect your earpiece/headset into the PC, or lower your speaker volume</li><li>Press <code>Start Call</code> to start the conversation</li><li>You can speak at anytime, the VA is always listening</li><li>Speak close to the microphone as though speaking into a phone</li><li>Press <code>Hang Up</code> to end the conversation</li></ul><h4>Users</h4><p>The VA has some fake users with different GL status. Try the following Membership Numbers.</p><table class=\"table table-condensed table-bordered table-striped\"><tbody><tr><th style=width:10% class=text-center>Member ID</th><th style=\"vertical-align: middle\">GL status</th><th style=\"vertical-align: middle\">RL status</th></tr><tr><td class=text-center>1</td><td>No GLs</td><td>Not received</td></tr><tr><td class=text-center>2</td><td>Declined GLs</td><td>Not received</td></tr><tr><td class=text-center>3</td><td>1 approved GL</td><td>Received / Issued</td></tr><tr><td class=text-center>4</td><td>Some declined GLs</td><td>Received / Unknown</td></tr><tr><td class=text-center>5</td><td>Many approved GLs</td><td>Received / Rejected</td></tr><tr><td class=text-center>6</td><td>VVIP</td><td>Not received</td></tr></tbody></table><h4>Enquiries</h4><p>The VA currently has the following enquiries available.</p><ul><li>hi</li><li>bye</li><li>start</li><li>gl status</li><li>rl status</li><li>refax gl</li><li>room</li></ul></div><div class=col-lg-6><br><br><br><br><div class=\"alert alert-info\"><b>Note:</b> We recommend using earphones or a headset this demo. If you don\'t have earphones/headset, lower the volume of your speakers. This is to prevent the Text-To-Speech audio from interfering with your voice commands.</div><div class=\"center-align text-center\"><div ng-if=\"vm.isErrored === true\" class=\"alert alert-danger\"><div ng-if=!vm.errorType><b>We\'re sorry</b>, something went wrong. Please contact Taiger for more assistance. Thank you.</div><div ng-if=\"vm.errorType == \'TTS_ERROR\'\"><b>Error: </b>There was an error with Text-To-Speech.</div><div ng-if=\"vm.errorType == \'MIC_ERROR\'\"><b>Error: </b>We were unable to access your microphone. Please allow this page to access your microphone, then refresh the page.</div><div ng-if=\"vm.errorType == \'SPEECHSERVER_CONNECTION_ERROR\'\"><b>Error: </b>Please navigate to <a href=https://aia-dev.taiger.com:8080>https://aia-dev.taiger.com:8080</a> and add a security exception for the page. Then, return to this page and press \'Start Call\' again.</div></div><!-- <h1><b>AIA</b><br>Virtual Assistant Demo</h1> --><br><br><br><br><button ng-disabled=\"vm.isErrored || vm.state !== \'IDLE\' || vm.state === \'PAUSED\'\" ng-click=vm.initialStart() class=\"btn btn-lg btn-primary\" style=width:50%><span ng-if=\"vm.state === \'IDLE\'\"><i class=\"fa fa-phone\"></i> Start Call </span><span ng-if=\"vm.state === \'STARTING\'\">STARTING UP... </span><span ng-if=\"vm.state === \'RECORDING\'\"><i class=\"fa fa-circle blink\"></i> Listening...</span></button> <button ng-if=\"vm.state === \'RECORDING\'\" class=\"btn btn-default\" ng-click=vm.stop()><span class=text-danger><i class=\"fa fa-stop-circle-o\"></i>&nbsp;Hang Up</span></button><br><br><div class=text-center ng-if=\"vm.isExpectingMembershipNumber && vm.secondsToTimeout > 0\"><i class=\"fa fa-cog fa-spin\"></i> Waiting <b>{{vm.secondsToTimeout ? vm.secondsToTimeout.toFixed(0) + \'s\' : \'\'}} </b>for membership number...</div></div><br><br><br><div class=\"panel panel-default center-block\" style=width:80%><div class=\"panel-heading panel-heading-thin\" ng-click=\"vm.showConvo = !vm.showConvo\"><b>Live Conversation Log</b> <i class=\"pull-right fa\" ng-class=\"{\'fa-chevron-left\': !vm.showConvo, \'fa-chevron-down\' : vm.showConvo}\"></i></div><div id=iconverse class=panel-body ng-if=\"vm.showConvo === true\" style=\"height: 300px; max-height:500px; overflow-y:scroll\" scroll-glue><div class=chat-log><chat-bubble message=msg ng-repeat=\"msg in vm.conversation\"></chat-bubble><br></div></div><div class=\"panel-body nomargins\" style=\"border-top: 1px solid #CCC\" ng-if=vm.showConvo><form class=form-inline ng-submit=vm.sendTextMsg()><input type=text ng-model=vm.textInput placeholder=\"You can also type to chat here...\" class=form-control style=width:100%></form></div></div><br><input ng-if=showTestInput ng-model=vm.vrTestInput class=form-control> <button style=height:20px;width:10px;position:fixed;top:0;left:0;background:transparent;border:none ng-click=\"showTestInput = !showTestInput\"></button></div></div><div class=row><logger-panel api=vm.logPanel></logger-panel></div></div>");
    $templateCache.put("app/ms/ms.html", "MSSS");
    $templateCache.put("app/sockets/socket.html", "<div class=container><h2>hello socket</h2><button class=\"btn btn-success\" ng-click=vm.openSocket()>Open Stream</button> <button class=\"btn btn-success\" ng-click=vm.closeSocket()>Disconnect</button><br><br><div class=\"panel panel-success\"><div class=panel-heading>Transcription Results</div><div class=panel-body style=\"height:500px; overflow-y: scroll\" scroll-glue><div ng-repeat=\"result in vm.results track by $index\">{{result}}</div></div></div></div>");
    $templateCache.put("app/components/application-form/application-form.component.html", "<!-- START: Application Form --><div class=ibox><div class=ibox-content><h2>Application Form</h2><div class=hr-line-dashed></div><form class=app-form name=appForm><div class=\"form-section mb-10\" ng-repeat=\"section in $ctrl.formSections\"><h3>{{section.header}}</h3><div class=form-group ng-repeat=\"field in section.fields\" ng-class=\"{\n          \'has-error\': $ctrl.metadata[field.dataKey].overallConfidence <= 0.5 && !$ctrl.isFieldUserChanged(field.dataKey),\n          \'has-warning\': $ctrl.metadata[field.dataKey].overallConfidence <= 0.8 && !$ctrl.isFieldUserChanged(field.dataKey)\n          }\"><label class=\"text-muted control-label\">{{field.label}}</label><div class=input-group><span class=input-group-addon><span ng-if=!$ctrl.isFieldUserChanged(field.dataKey) ng-bind-html=\"$ctrl.metadata[field.dataKey].overallConfidence | confidenceIndicator\"></span> <i ng-if=$ctrl.isFieldUserChanged(field.dataKey) class=\"fa text-navy fa-check-circle\"></i> </span><input name={{field.dataKey}} ng-if=!field.type type=text class=form-control ng-model=$ctrl.inputData[field.dataKey]><select name={{field.dataKey}} ng-if=\"field.type === \'select\'\" class=form-control ng-model=$ctrl.inputData[field.dataKey] ng-options=\"o as o for o in field.options\"></select><div ng-if=\"field.type === \'radio\'\"><label class=checkbox-inline ng-repeat=\"o in field.options\"><input name={{field.dataKey}} type=checkbox ng-model=$ctrl.inputData[field.dataKey] ng-value=\"\'{{o}}\'\"> {{o}}</label></div><div ng-if=\"$ctrl.metadata[field.dataKey] && !$ctrl.isFieldUserChanged(field.dataKey)\" class=input-group-btn><button ng-click=$ctrl.viewDatapoints(field.dataKey) class=\"btn btn-white\" type=button><i class=\"fa fa-eye\"></i> View Data</button></div></div><p ng-if=\"!$ctrl.isFieldUserChanged(field.dataKey) && $ctrl.metadata[field.dataKey].overallConfidence <= 0.8\" class=help-block><small>{{$ctrl.metadata[field.dataKey].datapoints[0].message ? $ctrl.metadata[field.dataKey].datapoints[0].message : \'Please check this field for errors\'}} </small>&nbsp; <button ng-click=$ctrl.setFieldUserChanged(field.dataKey) class=\"btn btn-success btn-xs\"><i class=\"fa fa-check\"></i> use extracted value</button></p><p ng-if=\"$ctrl.metadata[field.dataKey] && $ctrl.isFieldUserChanged(field.dataKey)\" class=help-block><small ng-if=\"$ctrl.metadata[field.dataKey].evaluatedValue !== $ctrl.inputData[field.dataKey]\">Taking user edited value for this field </small><small ng-if=\"$ctrl.metadata[field.dataKey].evaluatedValue === $ctrl.inputData[field.dataKey]\">Field validated by user </small><button ng-click=$ctrl.revertFieldUserChanges(field.dataKey) class=\"btn btn-link btn-xs\"><i class=\"fa fa-undo\"></i> undo</button></p></div></div><button ng-disabled=$ctrl.isSubmitting ng-click=$ctrl.submit() class=\"btn btn-block btn-success\"><div ng-if=$ctrl.isSubmitting><i class=\"fa fa-spinner fa-spin\"></i> Submitting...</div><div ng-if=!$ctrl.isSubmitting>Submit Application</div></button></form></div></div><!-- END: Application Form-->");
    $templateCache.put("app/components/document-viewer/document-viewer.component.html", "<div class=\"ibox nomargins border-left\"><!--   <div class=\"ibox-title\">\n    <h5>Document Viewer</h5>\n  </div> --><div cg-busy=$ctrl.loading class=\"ibox-content nopaddings border-bottom\"><!--   <table ng-if=\"$ctrl.hasData\" class=\"table table-condensed\" style=\"width:600px;\">\n      <tr>\n        <td colspan=\"2\" class=\"text-center\">\n          <button \n          ng-click=\"$ctrl.loadDatapointAtIndex($ctrl.currDatapointIndex-1)\" \n          ng-hide=\"$ctrl.currDatapointIndex == 0\"\n          class=\"btn btn-xs btn-white\"><i class=\"fa fa-chevron-left\"></i></button>\n\n          &nbsp;&nbsp;\n          <b>Viewing {{$ctrl.currDatapointIndex + 1}} of {{$ctrl.datapoints.length}} datapoints</b>\n          &nbsp;&nbsp;\n\n          <button \n          ng-click=\"$ctrl.loadDatapointAtIndex($ctrl.currDatapointIndex+1)\"\n          ng-hide=\"$ctrl.currDatapointIndex >= $ctrl.datapoints.length-1\"\n          class=\"btn btn-xs btn-white\"><i class=\"fa fa-chevron-right\"></i></button>\n        </td>\n      </tr>\n      <tr>\n        <td class=\"text-right\">Field</td>\n        <td>{{$ctrl.currentDatapoint.name}}</td>\n      </tr>\n      <tr>\n        <td class=\"text-right\">Value</td>\n        <td>{{$ctrl.currentDatapoint.value}}</td>\n      </tr>\n      <tr>\n        <td class=\"text-right\">Type</td>\n        <td>{{$ctrl.currentDatapoint.positions.length ? \'Data Hit (\' + $ctrl.currentDatapoint.positions.length + \')\' : \'Inferred\'}}</td>\n      </tr>\n      <tr>\n        <td class=\"text-right\">Confidence</td>\n        <td>{{$ctrl.currentDatapoint.confidence}}</td>\n      </tr>\n    </table> --><div ng-show=$ctrl.hasData class=pdf-holder><div class=metadata-panel><div><button ng-click=$ctrl.loadDatapointAtIndex($ctrl.currDatapointIndex-1) ng-hide=\"$ctrl.currDatapointIndex == 0\" class=\"btn btn-xs btn-info btn-rounded\"><i class=\"fa fa-chevron-left\"></i>&nbsp;Previous</button> &nbsp;&nbsp; <b>Viewing {{$ctrl.currDatapointIndex + 1}} of {{$ctrl.datapoints.length}} datapoints</b> &nbsp;&nbsp; <button ng-click=$ctrl.loadDatapointAtIndex($ctrl.currDatapointIndex+1) ng-hide=\"$ctrl.currDatapointIndex >= $ctrl.datapoints.length-1\" class=\"btn btn-xs btn-info btn-rounded\">Next&nbsp;<i class=\"fa fa-chevron-right\"></i></button></div><div class=\"row nomargins mt-5 text-left\"><div class=col-md-4><b>Field:</b> {{$ctrl.currentDatapoint.name}}</div><div class=col-md-3><b>Type:</b> {{$ctrl.currentDatapoint.positions.length ? \'Data Hit (\' + $ctrl.currentDatapoint.positions.length + \')\' : \'Inferred\'}}</div><div class=col-md-3><b>Confidence:</b> {{$ctrl.currentDatapoint.confidence}}</div><div class=col-md-2><b>DPI:</b> {{$ctrl.currentDatapoint.dpi}}</div></div><div class=\"row nomargins\"><div class=\"col-md-12 text-left\"><b>Extracted Value:</b> {{$ctrl.currentDatapoint.value}}</div></div></div><div class=annotation ng-repeat=\"item in $ctrl.annotations\" style=\"width: {{item.width}}px; top:{{item.top}}px; height:{{item.height}}px; left: {{item.left}}px\"></div><canvas id=the-canvas style=width:600px></div><h3 ng-hide=$ctrl.hasData class=\"text-muted text-center\"><br><br><br>Select a Datapoint to View<br><br><br></h3></div></div>");
    $templateCache.put("app/components/document-list-item/document-list-item.component.html", "<div><div ng-if=\"$ctrl.state === \'COMPLETE\' || $ctrl.doc.hasLoaded\"><!-- <i ng-if=\"!$ctrl.hideArrowIcon\" class=\"fa fa-chevron-right fa-2x item-right-icon\"></i>\n\n      <i ng-if=\"!$ctrl.doc.isConfirmed\" class=\"fa fa-circle-o item-indicator\"></i>\n\n      <i ng-if=\"$ctrl.doc.isConfirmed\" class=\"fa fa-check-circle text-navy item-indicator\"></i> --> <strong>{{$ctrl.doc.metadata.classification || \"UNKNOWN\"}} <span ng-if=\"$ctrl.doc.metadata.dpi >= 300\" class=\"label label-primary label-sm\">GOOD DPI</span> <span ng-if=\"$ctrl.doc.metadata.dpi > 200 && $ctrl.doc.metadata.dpi < 300\" class=\"label label-primary label-sm\">FAIR DPI</span> <span ng-if=\"$ctrl.doc.metadata.dpi < 300\" class=\"label label-danger label-sm\">POOR DPI</span></strong><div class=\"small m-t-xs\"><p class=m-b-none>{{$ctrl.doc.filename}} • <button class=\"btn btn-xs btn-white\" ng-click=$ctrl.delete($event)>delete</button></p></div></div></div><div ng-if=\"$ctrl.state !== \'COMPLETE\' && !$ctrl.doc.hasLoaded\" class=\"text-center text-bold\"><small><i class=\"fa fa-spinner fa-spin\"></i> <span ng-if=\"$ctrl.state === \'UPLOAD\'\">Uploading File</span> <span ng-if=\"$ctrl.state === \'CLASSIFY\'\">Classifying</span> <span ng-if=\"$ctrl.state === \'OCR\'\">Processing Optical Recognition</span> <span ng-if=\"$ctrl.state === \'EXTRACT\'\">Extracting Datapoints</span> ... </small><small ng-if=\"$ctrl.currentLoadProgress < 100\">{{$ctrl.currentLoadProgress | number:0 }}% </small><small ng-if=\"$ctrl.currentLoadProgress >= 100\">100%</small><div class=\"progress mt-5\"><div style=\"width: {{$ctrl.currentLoadProgress}}%\" class=progress-bar></div></div></div>");
    $templateCache.put("app/components/logger-panel/logger-panel.component.html", "<div class=\"panel panel-warning full-width\"><div class=\"panel-heading panel-heading-thin\" ng-click=\"$ctrl.showLogs = !$ctrl.showLogs\"><b>Debugging Log</b> <i class=\"pull-right fa\" ng-class=\"{\'fa-chevron-left\': !$ctrl.showLogs, \'fa-chevron-down\' : $ctrl.showLogs}\"></i></div><div style=\"overflow-y:scroll; height: {{$ctrl.heightPx || \'250px\'}}\" class=panel-body ng-if=\"$ctrl.showLogs === true\" scroll-glue><div ng-class=\"{\'text-danger\':log.type === \'ERROR\', \'text-success\':log.type === \'INFO\', \'text-info\':log.type === \'SUCCESS\'}\" ng-repeat=\"log in $ctrl.logs\"><small>{{log.timestamp | amDateFormat:\'DD/MM/YY HH:mm:ss\'}} - {{log.type}} - {{log.text}}</small></div></div><div class=panel-footer ng-if=\"$ctrl.showLogs === true\"><button ng-click=$ctrl.clearLog() class=\"btn-xs btn btn-white\"><i class=\"fa fa-times\"></i> Clear Log</button> <button ng-click=$ctrl.addStamp() class=\"btn-xs btn btn-white\"><i class=\"fa fa-stamp\"></i> Stamp</button></div></div>");
    $templateCache.put("app/components/navbar/navbar.html", "<nav class=\"navbar navbar-static-top navbar-inverse\"><div class=container-fluid><div class=navbar-header><a class=navbar-brand href=https://github.com/Swiip/generator-gulp-angular><span class=\"glyphicon glyphicon-home\"></span> Gulp Angular</a></div><div class=\"collapse navbar-collapse\" id=bs-example-navbar-collapse-6><ul class=\"nav navbar-nav\"><li class=active><a ng-href=#>Home</a></li><li><a ng-href=#>About</a></li><li><a ng-href=#>Contact</a></li></ul><ul class=\"nav navbar-nav navbar-right acme-navbar-text\"><li>Application was created {{ vm.relativeDate }}.</li></ul></div></div></nav>");
    $templateCache.put("app/components/test-component/test-component.component.html", "I\'m Working!");
    $templateCache.put("app/iconverse/chat/chat-detail.html", "<ion-view view-title=Details><div class=\"bar bar-subheader bar-stable\"><button ng-click=app.historyBack() class=\"button-clear button button-icon icon ion-ios-arrow-back\">Back</button><h1 class=title>{{vm.title}}</h1></div><ion-content class=has-subheader><ion-list ng-if=\"vm.type === \'LINKS\'\"><ion-item ng-click=vm.selectListItem(link) class=\"item item-text-wrap\" ng-repeat=\"link in vm.content\">{{link.text}}</ion-item></ion-list><div class=list ng-if=\"vm.type === \'DETAILS\'\" ng-repeat=\"detail in vm.content\"><div class=\"item item-text-wrap\"><p>OFFENCE</p><h2><strong>{{detail.label}}</strong></h2></div><div class=\"item item-text-wrap row\"><div class=\"col col-50\"><p>ACTION</p><h2><strong>{{detail.properties.requiredPoliceAction}}</strong></h2></div><div class=\"col col-50\"><p>SECTION</p><h1 class=nomargins><strong>{{detail.properties.penalCodeSection}}</strong></h1></div></div><div class=\"item item-text-wrap\"><p>DESCRIPTION</p><h2 ng-bind-html=detail.properties.description class=preline-text></h2></div></div></ion-content></ion-view>");
    $templateCache.put("app/iconverse/chat/chat.html", "<ion-view view-title=Advisor id=iconverse><ion-content scrollbar-y=false class=\"padding has-footer\"><div class=chat-log><chat-bubble message=msg on-click-attachment=vm.clickAttachment(msg) on-show-more=vm.didClickShowMore() on-click-link=vm.clickChatLink(link) on-click-choice=\"vm.clickChoice(choice, msg)\" ng-repeat=\"msg in vm.conversation\"></chat-bubble><br></div></ion-content><ion-footer-bar keyboard-attach class=\"bar-stable bar-light\"><form ng-submit=vm.processEntry() class=\"nomargins chat-form-mobile\" role=form><div class=\"item-input-inset brand-icons\"><button type=button ng-click=vm.record() class=\"button icon ion-mic-a button-clear btn-left\"></button><label class=item-input-wrapper><input type=text class=input-box ng-model=vm.entry placeholder=\"Ask me something...\"></label><button ng-disabled=!vm.entry type=submit class=\"button icon ion-android-arrow-dropup-circle button-clear btn-right\"></button></div></form></ion-footer-bar></ion-view>");
    $templateCache.put("app/iconverse/chat/components/chat-bubble.directive.html", "<div ng-class=\"{\'has-attachment\': hasAttachment}\"><div class=chat-bubble-wrapper><div class=chat-bubble ng-class=\"{\'user\': sourceIsUser, \'system\': !sourceIsUser}\"><!-- text --><div class=preline-text ng-bind-html=\"message.text | sanitize\"></div><!-- links --><ul class=\"links truncate\" ng-show=message.links><!-- If link limit is off --><li ng-if=\"message.links.length <= linksLimitCount || showAllLinks\" ng-repeat=\"link in message.links\"><a ng-click=clickLink(link)>{{link.text}}</a></li><!-- If link limit is on --><li ng-if=\"!(message.links.length <= linksLimitCount || showAllLinks)\" ng-repeat=\"link in message.links | limitTo:linksLimitCount\"><a ng-click=clickLink(link)>{{link.text}}</a></li></ul><!-- Choices --><div class=choices-panel ng-if=message.choices.length><button class=\"chat-choice-btn button button-small button-calm\" ng-click=clickChoice(choice) ng-repeat=\"choice in message.choices\">{{choice.text}}</button></div><!-- Weather --><table class=\"three-col content-middle\" ng-if=message.payload.elements[0].properties.temperatureValue><tr class=text-center><td>{{message.payload.elements[0].properties.iconPhrase}}</td><td class=temperature>{{message.payload.elements[0].properties.temperatureValue}}&deg;C</td><td><img ng-src=img/weather-icons/{{message.payload.elements[0].properties.weatherIcon}}-s.png></td></tr></table></div><!-- Main Attachment Link --><div ng-if=hasAttachment class=\"brand-icons attachment\"><button ng-click=clickAttachment() class=\"button icon ion-play button-clear\"></button></div></div></div>");
}]);