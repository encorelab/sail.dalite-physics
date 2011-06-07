require 'rest_client'
require 'uri'
require 'mongo'

require 'model'

require 'ruby-debug'

$: << 'sail.rb/lib'
require 'sail/agent'


class Inquisitor < Sail::Agent
  def initialize(opts)
    @run_id = opts[:run_id]
    raise ArgumentError, "No run_id specified!" unless @run_id
    opts[:room] = "run-#{@run_id}"
    
    super(opts)

    #@rollcall = RestClient::Resource.new("http://rollcall.proto.encorelab.org")
    #@rollcall = RestClient::Resource.new("http://localhost:3000")
    
    @mongo = Mongo::Connection.new.db('dalite-physics')
    
    @arlo = RestClient::Resource.new(CMS_BASE_URL)
  end
  
  def logic
    when_ready do
      pres = Blather::Stanza::Presence::Status.new
      pres.to = agent_jid_in_room
      pres.state = :chat
      
      log "Joining #{agent_jid_in_room.inspect}..."
      
      client.write(pres)
      groupchat_logger_ready!
    end
  
    event :joined? do |stanza, payload|
      login = Util.extract_login(payload['who'] || stanza.from)
      
      u = User.find(login)
      log "#{u} joined!"
      
      if u.kind == 'Student'
        if u.homework_completed?
          log "#{u} has already completed the homework section."
        else
          log "#{u} has not yet completed the homework section."

          unless u.is_already_in_expertise_group?
            log "#{u} is not yet in an expertise group... will randomly assign one..."
            u.randomly_assign_to_expertise_group!
            u.reload
            exp_group = u.current_expertise_group
            log "#{u} is now in expertise group: #{u.current_expertise_group}"
          end

          do_homework(u)
        end
      else
        log "#{u} is not a student... ignoring."
      end    
    end
    
    event :question_answered? do |stanza, payload|
      answers = @mongo['answers']
      
      login = Util.extract_login(stanza.from)
      
      u = User.find(login)
      
      u.question_answered!(payload['questionID'])
      
      u.reload
      
      a = {
        :run_id => @run_id,
        :question_id => payload['questionID'],
        :tags => payload['chosenTags'],
        :choice => payload['choice'],
        :rationale => payload['rationale'],
        :timestamp => Time.now,
        :user => {
          :id => u.id,
          :login => u.account.login,
          :jid => stanza.from.to_s
        }
      }
      
      answers.insert(a)
      
      do_homework(u)
    end
    
    event :group_question_answered? do |stanza, payload|
      answers = @mongo['answers']
      
      gid = payload['groupID']
      g = Group.find(gid)
      
      a = {
        :run_id => @run_id,
        :question_id => payload['questionID'],
        :tags => payload['chosenTags'],
        :question_url => payload['questionURL'],
        :correct => payload['answeredCorrectly'] == true,
        :choice => payload['choice'],
        :rationale => payload['rationale'],
        :timestamp => Time.now,
        :group => {
          :id => g.id,
          :login => g.account.login,
          :jid => stanza.from.to_s
        }
      }
      
      answers.insert(a)   
    end
    
    event :done? do |stanza, payload|
      login = Util.extract_login(stanza.from)
      
      u = User.find(login)
      
      u.homework_completed!
    end
    
    # event :question_assigned? do |stanza, payload|
    #       
    #     end
    
    message :error? do |err|
      log "\n\n\n"
      log "!" * 80
      log "GOT ERROR MESSAGE: #{err.inspect}"
      log "!" * 80
    end
    
    disconnected do
      # automatically reconnect
      log "DISCONNECTED!"
      log "attempting to reconnect..."
      client.connect
    end
  end
  
  
  protected
  
  def do_homework(u)
    answers = @mongo['answers']
    past_answers = answers.find('user.id' => u.id)
    
    log "#{u} has so far answered #{past_answers.count} questions"
    
    if past_answers.count >= 5
      event!(:done, {}, :to => u.jid)
    else
      last_id = u.last_unanswered_question_id
    
      if last_id
        q = JSON.parse(@arlo['questions/'+last_id+'.json'].get)['question']
        unless q
          log "question #{last_id.inspect} was not found in the CMS!", :ERROR
        end
        log "#{u} is on question #{q['id']}"
      else
        q = randomly_pick_unanswered_question_for_user(u)
      end
    
      assign_question(u, q)
    end
  end
  
  def randomly_pick_unanswered_question_for_user(u)    
    answers = @mongo['answers']
    past_answers = answers.find('user.id' => u.id)
    
    exp = u.current_expertise_group
  
    log "Randomly selecting a new question for #{u} from #{exp}"
  
    query = "Question.find(:all, :conditions => {:expertise_id => #{exp.id}})"
    
    begin
      questions = JSON.parse(@arlo['query.json?query='+CGI.escape(query)].get)['payload'].
        collect{|q| q['question']}
    rescue => e
      log "Error while querying CMS for questions in expertise ID #{exp.id.inspect}!: #{e}", :ERROR
    end
  
    answered_ids = past_answers.collect{|pa| pa['question_id'].to_i}
    unanswered_questions = questions.select{|q| not answered_ids.include? q['id'].to_i}
    
    if unanswered_questions.empty?
      log "#{u} has no more questions left to answer!", :ERROR
    end
    
    return unanswered_questions.sort_by{rand}.first
  end
  
  def assign_question(u, q)
    # {"eventType":"question_assigned",
    #   "payload":{"questionID":"15",
    #   "questionURL":"http://www.theredpin.com/images/widgets/HomepageSampleProjectSimple/cinema_tower_featured.jpg",
    #   "tags":["Newton","Gravity","Intertia"],
    #   "choices":["A","B","C"]}}
    
    query = "Question.find(#{q['id']}).tags"
    tags = JSON.parse(@arlo['query.json?query='+CGI.escape(query)].get)['payload'].
         collect{|t| t['tag']}
    
    choices = ('A'..q['choice_limit']).to_a
    
    answers = @mongo['answers']
    past_answers = answers.find('question_id' => q['id'].to_s).collect do |pa|
      {'rationale' => pa['rationale'], 'tags' => pa['tags'], 'choice' => pa['choice']}
    end
    
    data = {
      'questionID' => q['id'],
      'questionURL' => CMS_BASE_URL + q['image_path'],
      'tags' => tags.collect{|t| t['name']},
      'choices' => choices,
      'past_answers' => past_answers
    }
    
    event!(:question_assigned, data, :to => u.jid)
    
    u.question_assigned!(q['id'])
    
    log "Assigned question #{q['id'].inspect} to #{u}."
  end
  
end
