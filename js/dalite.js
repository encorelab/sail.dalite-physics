Dalite = {
    // config
    
    rollcallURL: 'http://rollcall.proto.encorelab.org',
    xmppDomain: 'proto.encorelab.org',
    //groupchatRoom: 's3@conference.proto.encorelab.org',
	groupchatRoom: 'physics@conference.proto.encorelab.org',
    
    
    // private global vars
    
    ui: Sail.UI,
    groupchat: null,
    session: null,
    justWatching: false,
    
    
    // initialization (called in $(document).ready() at the bottom of this file)
    
    init: function() {
        console.log("Initializing Dalite...")
        
        // create custom event handlers for all Dalite 'on' methods
        Sail.autobindEvents(Dalite, {
            pre: function() {console.debug(arguments[0].type+'!',arguments)}
        })
        
        $('#play').click(function() {$(Dalite).trigger('choseToPlay')})
        $('#watch').click(function() {$(Dalite).trigger('choseToWatch')})
  
		$('#submiteAnswer').click(Dalite.submitAnswer)
        
        $('#guess-form').submit(function() {Dalite.submitGuess(); return false})
        
        $('#set-word-form').submit(function () {Dalite.setNewWord(); return false})
        
        $('#connecting').show()
        
        Dalite.authenticate()
    },
    
    askForNewWord: function() {
        $(Dalite).trigger('enteringNewWord')
        Dalite.ui.showDialog('#set-word-panel')
        
        $('#set-word').attr('disabled', false)
        $('#guess-panel').hide()
        $('#set-word-panel').show('puff',
            { easing: 'swing' },
            'slow',
            function() { $('#set-word').val('').focus() }
        )
    },
    
    switchToGuessingMode: function() {
        $('.guess-baloon').remove()
        Dalite.ui.dismissDialog('#set-word-panel')
        $('#winner').hide()
        $('#definition').show()
        $('#guess').removeClass('in-progress')
        
        $('#guess').attr('disabled', false) // just in case...
        
        if (!Dalite.justWatching && !$('#guess-panel').is(':visible')) {
            $('#guess-panel').show('slide', 
                { easing: 'easeOutBounce',  direction: 'down'}, 
                'slow',
                function() {$('#guess').val('').focus()}
            )
        }
    },
    
    submitGuess: function() {         
		word = $('#guess').val()   
		sev = new Sail.Event('guess', {word: word})
        Dalite.groupchat.sendEvent(sev)
        $(Dalite).trigger('submittedGuess') 
    },
    
    setNewWord: function() {
        $('#set-word').addClass('in-progress')
        word = $('#set-word').val()
        sev = new Sail.Event('set_word', {word: word})
        Dalite.groupchat.sendEvent(sev)
        $(Dalite).trigger('submittedNewWord')
    },   
              
	// the name for this function should indicate an 'action'
	submitAnswer: function () {
		answer = $('#answer').text();
		sev = new Sail.Event('answerToQuestion', {'answer' : answer} );     
        Dalite.groupchat.sendEvent(sev);   
        $(Dalite).trigger('questionAnswered'); 
	},
	
    
    authenticate: function() {
        Dalite.rollcall = new Sail.Rollcall.Client(Dalite.rollcallURL)
        Dalite.token = Dalite.rollcall.getCurrentToken()

        if (!Dalite.token) {
            $(Dalite).trigger('authenticating')
            Dalite.rollcall.redirectToLogin()
            return
        }
        
        Dalite.rollcall.fetchSessionForToken(Dalite.token, function(data) {
            Dalite.session = data.session
            $(Dalite).trigger('authenticated')
        })
    },

	
    
    events: {
        // mapping of Sail events to local Javascript events
        sail: {
            'guess': 'gotGuess',
            'set_definition': 'gotNewDefinition',
            'wrong': 'gotWrongGuess',
            'bad_word': 'gotBadWord',
            'win': 'gotWinner',
			'greet': 'gotGreet'
        },
        
        // local Javascript event handlers
        onAuthenticated: function() {
            session = Dalite.session
            console.log("Authenticated as: ", session.user.username, session.user.encrypted_password)
        
            $('#username').text(session.user.username)
        
            Sail.Strophe.bosh_url = '/http-bind/'
         	Sail.Strophe.jid = session.user.username + '@' + Dalite.xmppDomain
          	Sail.Strophe.password = session.user.encrypted_password
      	
          	Sail.Strophe.onConnectSuccess = function() {        
	
          	    sailHandler = Sail.generateSailEventHandler(Dalite)  
          	    Sail.Strophe.addHandler(sailHandler, null, null, 'chat')
      	    
          	    Dalite.groupchat = Sail.Strophe.joinGroupchat(Dalite.groupchatRoom)
          	    Dalite.groupchat.addHandler(sailHandler)
      	    
          	    $('#connecting').hide()
          	    $(Dalite).trigger('joined')
          	}
      	
          	Sail.Strophe.connect()
        },
    
        onJoined: function() {
            $(Dalite).trigger('choosingWhetherToWatchOrPlay')
            Dalite.ui.showDialog('#join-dialog')
        },
    
        onChoseToPlay: function() {
            Dalite.justWatching = false
            Dalite.askForNewWord()
        },
    
        onChoseToWatch: function() {
           Dalite.justWatching = true 
        },
    
        onSubmittedGuess: function() {  
			$('#guess').addClass('in-progress')
            $('#guess').attr('disabled', true)
        },
    
        onSubmittedNewWord: function() {
            $('#set-word').attr('disabled', true)
            $('#winner').hide()
        },  
             
		// the name should indicate an 'event' - past tense
  		onQuestionAnswered: function () {
	    	$('#answer').text('Submitted');
		},
            
        onGotNewDefinition: function(ev, sev) {
            definition = sev.definition
            $('#set-word').removeClass('in-progress')
            $('#definition').text(definition)
            Dalite.switchToGuessingMode()
        },
    
        onGotWrongGuess: function(ev, sev) {
            definition = sev.definition
            $('#guess').removeClass('in-progress')
            $('#guess-container').effect('shake', {duration: 50, distance: 5}, function() {
                $('#guess').val('').attr('disabled', false).focus()
            })
        },
    
        onGotBadWord: function(ev, sev) {
            message = sev.message
            $('#set-word').removeClass('in-progress')
            alert(message)
            $('#set-word').val('').attr('disabled', false).focus()
        },
    
        onGotGuess: function(ev, sev) {
            word = sev.word
            player = sev.from.split('/')[1].split('@')[0]
            baloon = $("<div class='guess-baloon'><div class='word'>"+word+"</div><div class='player'>"+player+"</div></div>")
            baloon.hide()
            field_height = $("#field").height()
            field_width = $("#field").width()
            baloon.css('left', (Math.random() * (field_width - 100) + 'px'))
            baloon.css('top', (Math.random() * (field_height - 100) + 'px'))
            $("#field").append(baloon)
            baloon.show('puff', 'fast')
            baloon.draggable()
        },
    
        onGotWinner: function(ev, sev) {
            winner = sev.winner.split('/')[1].split('@')[0]
            $('.guess-baloon').remove()
            $('#guess-panel').hide('slide',
                        {easing: 'swing', direction: 'down'},
                        'fast')
            $('#definition').hide('puff', 'fast')
            $('#winner-username').text(winner)
            $('#winner').show('pulsate', 'normal')//'drop', {easing: 'easyOutBounce'}, 'fast')
            if (sev.winner == Dalite.groupchat.jid()) {
                // you are the winner!
                Dalite.askForNewWord()
            }
        },

		onGotGreet: function(ev, sev){
			greeting = sev.definition;   
			$('#greeting-box').text(greeting);
		},
    },
    
    
}    


$(document).ready(Dalite.init)