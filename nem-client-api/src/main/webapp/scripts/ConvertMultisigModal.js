"use strict";

define(['NccModal', 'Utils', 'handlebars', 'typeahead'], function(NccModal, Utils, Handlebars) {
	return NccModal.extend({
	    data: {
            isFeeAutofilled: true,
            dueBy: 1
        },
        computed: {
            hoursDue: function() {
                return this.get('dueBy') | 0;
            },
            fee: {
                get: function() {
                    return Utils.format.nem.getNemValue(Utils.format.nem.stringToNem(this.get('formattedFee')));
                },
                set: function(fee) {
                    this.set('formattedFee', Utils.format.nem.formatNemAmount(fee));
                    this.update('fee'); // so that stupid Ractive trigger fee observers
                }
            },
            feeValid: function() {
                return this.get('fee') >= this.get('minimumFee');
            },
            feeError: function() {
                return !this.get('feeValid') && this.get('feeChanged');
            },
            formattedMinimumFee: function() {
                return Utils.format.nem.formatNemAmount(this.get('minimumFee'));
            },
            passwordValid: function() {
                return !!this.get('password');
            },
            passwordError: function() {
                return !this.get('passwordValid') && this.get('passwordChanged');
            },
            formValid: function() {
                return this.get('feeValid') && this.get('passwordValid');
            }
        },
        resetFee: function(options) {
            var requestData = {
                wallet: ncc.get('wallet.wallet'),
                multisig: ncc.get('activeAccount.address'),
                cosignatories: this.get('cosignatories')
                    .filter(function(e){ return (!!e.address); })
                    .map(function(e){ return {'address':e.address}}),
                hoursDue: this.get('hoursDue')
            };
            var self = this;

            ncc.postRequest('wallet/account/modification/validate', requestData,
                function(data) {
                    self.set('minimumFee', data.fee);
                },
                {
                    altFailCb: function(faultId, error) {
                    }
                }, options.silent
            );
        },
		addCosignatory: function() {
            $('.js-cosignatory').last().focus();
            this.get('cosignatories').push({label:''});
            $('.js-cosignatory').last().focus().typeahead({
                hint: false,
                highlight: true
            }, {
                name: 'address-book',
                source: Utils.typeahead.addressBookMatcher,
                displayKey: 'formattedAddress',
                templates: {
                    suggestion: Handlebars.compile('<span class="abSuggestion-label">{{privateLabel}}</span> <span class="abSuggestion-address">{{formattedAddress}}</span>')
                }
            }, {
                name: 'format-address',
                source: Utils.typeahead.justFormatAddress,
                displayKey: 'formattedAddress',
                templates: {
                    suggestion: Handlebars.compile('<span class="abSuggestion-justFormat">{{text}} &quot;{{formattedAddress}}&quot;</span>')
                }
            });

            // TODO: not sure if this is ok to do... can this cause leaks?
            // var self = this;
            // var $cosignatory = $('.js-cosignatory');
            // $cosignatory.on('keypress', function(e) { Utils.mask.keypress(e, 'address', self); });
            // $cosignatory.on('paste', function(e) { Utils.mask.paste(e, 'address', self); });
            // $cosignatory.on('keydown', function(e) { Utils.mask.keydown(e, 'address', self); });


        },
        removeCosignatory: function(index) {
            this.get('cosignatories').splice(index, 1);
        },
        resetDefaultData: function() {
            this.set('privateLabels', ncc.get('privateLabels'));
            this.set('formattedMultisigAccount', Utils.format.address.format(ncc.get('activeAccount.address')));
            this.set('multisigAccount', ncc.get('activeAccount.address'));
        	this.set('cosignatories', [{label:''}]);

            this.set('fee', 0);
            this.set('minimumFee', 0);
            this.set('dueBy', '1');
            this.set('password', '');
            this.set('useMinimumFee', true);

            this.set('feeChanged', false);
            this.set('passwordChanged', true);
            this.resetFee({ silent: true });
        },
        sendTransaction: function() {
            var requestData = {
                wallet: ncc.get('wallet.wallet'),
                account: ncc.get('activeAccount.address'),
                type: 3, // multisig aggregate
                cosignatories: this.get('cosignatories')
                    .filter(function(e){ return (!!e.address); })
                    .map(function(e){ return {'address':e.address}}),
                password: this.get('password'),
                fee: this.get('fee'),
                hoursDue: this.get('hoursDue')
            };

            var txConfirm = ncc.getModal('modificationConfirm');
            txConfirm.set('txData', this.get());
            txConfirm.set('requestData', requestData);
            txConfirm.open();
        },
        onrender: function() {
            this._super();
            var self = this;

            this.resetDefaultData();

            this.observe({
                'cosignatories': (function() {
                    var t;
                    return function(objs) {
                        // that's bit dumb ;p
                        for (var i = 0; i<objs.length; ++i) {
                            self.set('cosignatories['+i+'].address', Utils.format.address.restore(objs[i].formattedAddress));
                        }
                        clearTimeout(t);
                        t = setTimeout(function() {
                            self.resetFee({ silent: true });
                        }, 500);
                    }
                })()
            },
            {
                init: false
            });
            this.observe({
                useMinimumFee: function(useMinimumFee) {
                    if (useMinimumFee) {
                        this.set('fee', this.get('minimumFee'));
                    }
                },
                minimumFee: function(minimumFee) {
                    if (this.get('useMinimumFee')) {
                        this.set('fee', minimumFee);
                    }
                }
            });
            this.observe({
                fee: function() {
                    this.set('feeChanged', true);
                },
                password: function() {
                    this.set('passwordChanged', true);
                }
            },
            {
                init: false
            });
            this.on({
                sendFormKeypress: function(e) {
                    if (e.original.keyCode === 13 && this.get('formValid')) {
                        this.sendTransaction();
                    }
                },
                modalOpened: function() {
                    $('.js-cosignatory').focus();
                    // TODO G-Krysto: this should be here not in modalClosed, or not?
                    this.resetDefaultData();
                },
                modalClosed: function() {
                    this.resetDefaultData();
                }
            });

            var $dueBy = $('.js-multisig-dueBy-textbox');
            $dueBy.on('keypress', function(e) { Utils.mask.keypress(e, 'number', self) });

            // var $cosignatory = $('.js-cosignatory');
            // $cosignatory.on('keypress', function(e) { Utils.mask.keypress(e, 'address', self); });
            // $cosignatory.on('paste', function(e) { Utils.mask.paste(e, 'address', self); });
            // $cosignatory.on('keydown', function(e) { Utils.mask.keydown(e, 'address', self); });

            var $fee = $('.js-multisig-fee-textbox');
            var feeTxb = $fee[0];
            $fee.on('keypress', function(e) { Utils.mask.keypress(e, 'nem', self); });
            $fee.on('paste', function(e) { Utils.mask.paste(e, 'nem', self); });
            $fee.on('keydown', function(e) { Utils.mask.keydown(e, 'nem', self); });

            this.listeners.push(ncc.observe({
                'texts.preferences.thousandSeparator': function(newProp, oldProp) {
                    feeTxb.value = Utils.format.nem.reformat(feeTxb.value, oldProp, newProp);
                },
                'texts.preferences.decimalSeparator': function(newProp, oldProp) {
                    feeTxb.value = Utils.format.nem.reformat(feeTxb.value, null, null, oldProp, newProp);
                }
            }));

            // Cosignatory fields

            $('.js-cosignatory').typeahead({
                hint: false,
                highlight: true
            }, {
                name: 'address-book',
                source: Utils.typeahead.addressBookMatcher,
                displayKey: 'formattedAddress',
                templates: {
                    suggestion: Handlebars.compile('<span class="abSuggestion-label">{{privateLabel}}</span> <span class="abSuggestion-address">{{formattedAddress}}</span>')
                }
            }, {
                name: 'format-address',
                source: Utils.typeahead.justFormatAddress,
                displayKey: 'formattedAddress',
                templates: {
                    suggestion: Handlebars.compile('<span class="abSuggestion-justFormat">{{text}} &quot;{{formattedAddress}}&quot;</span>')
                }
            });
        }
	});
});