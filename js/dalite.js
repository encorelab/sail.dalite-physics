Dalite = {
    // config
    
    rollcallURL: 'http://rollcall.proto.encorelab.org',
    xmppDomain: 'proto.encorelab.org',
    //groupchatRoom: 's3@conference.proto.encorelab.org',
	groupchatRoom: 'physics@conference.proto.encorelab.org',
	// groupchatRoom: 'run-6@conference.proto.encorelab.org',
    
    
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
  
		$('#submitButton').click(function() {Dalite.submitAnswer();})   
		$('#submitButton').click(function() {Dalite.submitGroupAnswer();})   
		$('.questionCell').live('click', function(ev) {Dalite.showAnswer(ev);})   
		
		$('#loadGroups').click(function() {Dalite.loadGroups();})
        
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
		questionID = $('#questionID').html();
		tags = $(':checkbox').filter (':checked').map(function(){
			return $(this).val();
		});           
		choice = $(':radio:checked').val();
		rationale = $('textarea#rationaleText').val();   
		// Check to see an answer is chosen, at least one tag is selected and rationale is provided
		if (tags.length == 0 || choice == null || rationale == ""){
			alert ("You must submit a CHOICE, select at least one TAG and provide a RATIONALE");  
		} else {		    
			sev = new Sail.Event('question_answered', {'questionID' : questionID, 'chosenTags' : $.makeArray(tags), 'choice' : choice, 'rationale' : rationale} );     
	        Dalite.groupchat.sendEvent(sev);   
	        $(Dalite).trigger('questionAnswered'); 
		}
	}, 
	
	// the name for this function should indicate an 'action'
	submitGroupAnswer: function () {    
		questionID = $('#questionID').html();
		tags = $(':checkbox').filter (':checked').map(function(){
			return $(this).val();
		});           
		choice = $(':radio:checked').val();
		rationale = $('textarea#rationaleText').val();   
		// Check to see an answer is chosen, at least one tag is selected and rationale is provided
		if (tags.length == 0 || choice == null || rationale == ""){
			alert ("You must submit a CHOICE, select at least one TAG and provide a RATIONALE");  
		} else {		    
			sev = new Sail.Event('group_question_answered', {'questionID' : questionID, 'chosenTags' : $.makeArray(tags), 'choice' : choice, 'rationale' : rationale} );     
	        Dalite.groupchat.sendEvent(sev);   
	        $(Dalite).trigger('questionAnswered'); 
		}
	}, 
	
	// Loading all the groups for THIS RUN using a jquery call to RollCall
	loadGroups: function() {               
		
		// hide the load groups button
		$('#loadGroups').css('display', 'none');
		
		// we have currently hard-coded the 'run id' and 'kind'
	  	var run_id = 2
		var kind = "Expertise"  
		var totalQuestions = 5

		$.ajax({
		  dataType: 'jsonp',
		  url: 'http://rollcall.proto.encorelab.org/runs/'+run_id+'/groups.json?kind='+kind,
		  success: function(data) { 
			    groups = data;
				
				groupTable = $('table#groupTable');
				for (i=1; i <= groups.length; i++){ 
					curGroupRow = $('<tr class="groupRow" id="gr'+i+'">');
					curGroupRow.append($('<td> Group ' +i+ '</td>'));
					for (j=1; j <= totalQuestions; j++) {
						curQuestionCell = $('<td class="questionCell" id="gr'+i+'_q'+j+'">');
						curQuestionCell.append($('<div class="questionNumber">'+j+'</div>'));
						curQuestionCell.append($('<div id="questionAnswer"></div>')); 
						curQuestionCell.append($('</td>'));
						curGroupRow.append(curQuestionCell);
					}
		            curGroupRow.append('</tr>');
					groupTable.append(curGroupRow);
				}
			groupTable.append($('</table>'));
		  }
		})  
		
	},
	  
	     
	// When the teacher clicks a specific question, the answer provided by the group is shown
	showAnswer : function (ev) {    
		selectedQuestionCellId = ev.target.parentNode.id;
		answerDiv = 'td#'+selectedQuestionCellId+' div#questionAnswer';   
		$('div#answerToSelectedQuestion').html($(answerDiv).html());
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
	        // multiple choice question is received by the client
			'question_assigned' : 'gotQuestion',     
			// individual done with all the question
			'done' : 'gotDone', 
			// teacher dashboard received all the groups  -- WE removed this event and decided the client should get the groups from RollCall
			// 'groups_received' : 'gotGroups',                                                                  
			
			// teacher dashboard received an answer
			'group_question_answered' : 'gotGroupAnswer',
            'guess': 'gotGuess',
            'set_definition': 'gotNewDefinition',
            'wrong': 'gotWrongGuess',
            'bad_word': 'gotBadWord',
            'win': 'gotWinner'
        },
        
        // local Javascript event handlers
        onAuthenticated: function() {
            session = Dalite.session
            console.log("Authenticated as: ", session.account.login, session.account.encrypted_password)
        
            $('#username').text(session.account.login)
        
            Sail.Strophe.bosh_url = '/http-bind/'     
         	Sail.Strophe.jid = session.account.login + '@' + Dalite.xmppDomain
          	Sail.Strophe.password = session.account.encrypted_password
      	
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
			sev = new Sail.Event('joined', {'who': Sail.Strophe.jid})
	        Dalite.groupchat.sendEvent(sev)
	
            $(Dalite).trigger('choosingWhetherToWatchOrPlay')
            Dalite.ui.showDialog('#join-dialog')
            
            $('#loading').show()
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
			$('button#submitButton').effect("highlight", {color:"#b1b1b1"}, 3000);  
	    	$('button#submitButton span').html('Sent...');    
			
		},
		  
		// When individuals receive a question
		onGotQuestion: function (ev, sev) {  
		    $('#loading').hide()   
			
			if ($('#topRow').css('display') == "none")  {
				$('#topRow').css('display', 'block');
			}                                     
			
			if ($('#bottomRow').css('display') == "none")  {
				$('#bottomRow').css('display', 'block');
			}
			 
			curQuestionID = sev.payload.questionID;
			questionURL = sev.payload.questionURL;     
			tags = sev.payload.tags;
			choices = sev.payload.choices;     
			
			// We need to check and see if this is a question assigned to a GROUP or and INDIVIDUAL
			// A group question comes with some more data regarding how individuals answered the question
			// and therefore it needs to draw a chart with their answers
			// pastAnswers = sev.payload.past_answers;   
			// 			    
			// 			if (pastAnswers.length > 0 ){                
			// 				google.load('visualization', '1', {'packages':['columnchart']}); 
			// 
			// 			  	// Set a callback to run when the Google Visualization API is loaded.
			// 				google.setOnLoadCallback(drawChart);       
			// 				
			// 			} 
			// 			
			// 			// Create our data table.
			// 		      var data = new google.visualization.DataTable();
			// 			data.addColumn('string', 'Task');
			// 			data.addColumn('number', 'Hours per Day');
			// 			data.addRows([
			// 			  ['Work', 11],
			// 			  ['Eat', 2],
			// 			  ['Commute', 2],
			// 			  ['Watch TV', 2],
			// 			  ['Sleep', {v:7, f:'7.000'}]
			// 			]);                                              
			// 
			// 
			// 		      // Instantiate and draw our chart, passing in some options.
			// 		      var chart = new google.visualization.ColumnChart(document.getElementById('chart_div'));
			// 		      chart.draw(data, {width: 400, height: 240}); 
			                                    
			// we need to save the current question's id in a hidden field to send when question answered
			$('#questionID').html(curQuestionID);
			     
			$('textArea#rationaleText').val('');
	    	$('button#submitButton span').html('Submit');
			
			// update the question with the new question
			$('#questionImage').attr('src', questionURL); 
			
			//We need to dynamically create checkboxes for all the received tags
			tagDiv = $('div#tags').html('<p><b>Tags</b></p>');   
			table = $('<table>');
			for (i=0; i<tags.length; i++) {
				if (i % 3 == 0){         
					curTr = $('<tr>');
				}                 
				curTd = $('<td>');
				curTd.append($('<input type="checkbox" name="'+tags[i]+'" value="'+tags[i]+'" />'));   
				curTd.append(tags[i]);   
				curTr.append(curTd);                                                              
				if ((i > 0 && (i % 3 != 1)) || (i == tags.length-1)){
					table.append(curTr);
				} 
			}      
			tagDiv.append(table);
			
			//We need to dynamically create radio buttons for all the received choices
			choiceDiv = $('div#choices').html('<p><b>Choices</b></p>');  
		    for (i=0; i<choices.length; i++) {            
				choiceDiv.append($('<input type="radio" name="'+$('#questionID').html()+'" value="'+choices[i]+'" />')); 
				choiceDiv.append(choices[i]);
			}  
			// alert (choiceDiv);
		},  
		
		
		// When an individual is done with all their questions and the agent notifies them
		onGotDone : function(ev, sev) {    
			$('div#topRow').html("<div style='margin-top: 50px; margin-left: 50px'>Congratulations! You're Finished</div>");
			$('div#bottomRow').html("");		
		}, 
		    
		// We have decided to eliminate this and instead make the client fetch the groups from RollCall
		// onGotGroups : function (ev, sev) {
		// 	groups = sev.payload.groups;
		// 	totalQuestions = sev.payload.totalQuestions;   
		// 	   
		// 	groupTable = $('table#groupTable');
		// 	for (i=1; i <= groups.length; i++){ 
		// 		curGroupRow = $('<tr class="groupRow" id="gr'+i+'">');
		// 		curGroupRow.append($('<td> Group ' +i+ '</td>'));
		// 		for (j=1; j <= totalQuestions; j++) {
		// 			curQuestionCell = $('<td class="questionCell" id="gr'+i+'_q'+j+'">');
		// 			curQuestionCell.append($('<div class="questionNumber">'+j+'</div>'));
		// 			curQuestionCell.append($('<div id="questionAnswer"></div>')); 
		// 			curQuestionCell.append($('</td>'));
		// 			curGroupRow.append(curQuestionCell);
		// 		}
		//                 curGroupRow.append('</tr>');
		// 		groupTable.append(curGroupRow);
		// 	}
		// 	groupTable.append($('</table>'));
		// },   
		
		onGotGroupAnswer : function (ev, sev){    
			groupNumber = sev.payload.groupID;
			questionNumber = sev.payload.questionID;    
			questionURL = sev.payload.questionURL;
			answeredCorrectly = sev.payload.answeredCorrectly;   
			chosenTags = sev.payload.chosenTags;
			//correctAnswer = sev.payload.correctAnswer;
			answer = sev.payload.groupAnswer;
			rationale = sev.payload.rationale;
			
			answeredQuestionCellId = 'gr'+groupNumber+'_q'+questionNumber;
			answeredQuestionCell = $('td#'+answeredQuestionCellId);  
			   
			// We need to populate a div (inside the question block) so that when the teacher clicks on a 
			// qeustion, they can see the question and the group's answer
			questionAnswer = $('td#'+answeredQuestionCellId+' div#questionAnswer');
			questionImage = $('<img src="'+questionURL+'"/>');
			questionAnswer.html(questionImage);
			questionAnswer.append("<div>Group Answer: "+answer+ "<br/><br/>Chosen Tags: "+chosenTags+"<br/><br/>Rationale: "+rationale+"</div>")
			questionAnswer.css ('display', 'none');
			
			
			// color the question block on the grid according to the answer submitted
			if (answeredCorrectly == "true"){
				$(answeredQuestionCell).css('background-color', 'green');
			}else {
				$(answeredQuestionCell).css('background-color', 'red');				
			}
			
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
    },
    
    
}    


function drawChart(){
	
	var data = new google.visualization.DataTable();
	data.addColumn('string', 'choice');
	data.addColumn('number', 'total answers');
	// this map holds the aggregate of all the given answers in order to be plotted on the graph
	selectedChoicesMap = {};  

	for (i=0; i<pastAnswers.length; i++){
		curAnswer = pastAnswers[i]['choice'];
		if (!selectedChoicesMap[curAnswer]) {
			selectedChoicesMap[curAnswer] = 1;
		} else {                                  					
			selectedChoicesMap[curAnswer] += 1;
		}               
	} 
	data.addRow([   
   $.each(selectedChoicesMap, function(index, value) { 
     document.write("['"+index +"', " + value + "]");
   })]);   
	   // for (i=0; i<selectedChoicesMap.length; i++){          
	   // 						debugger
	   // 				   		documnet.write("['"+selectedChoicesMap[i]+"',]");
	   // 				   }
}
